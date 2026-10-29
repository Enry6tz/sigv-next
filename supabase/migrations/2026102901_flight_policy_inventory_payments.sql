-- US-033/034/035. Extensión del esquema existente; no modifica migraciones previas.
-- Aplicar después de 20261021_payment_seat_check.sql, en una base de prueba primero.
begin;

alter table public.flights add column if not exists scheduled_departure time;
alter table public.flights add column if not exists taken_off_at timestamptz;
alter table public.flights add column if not exists service_timezone text not null default 'America/Argentina/Buenos_Aires';
alter table public.flights add column if not exists change_reason text;
update public.flights set scheduled_departure = departure where scheduled_departure is null;

do $$ declare v_name text; begin
  for v_name in select conname from pg_constraint where conrelid = 'public.flights'::regclass
    and contype = 'c' and pg_get_constraintdef(oid) like '%Retrasado%' loop
    execute format('alter table public.flights drop constraint %I', v_name);
  end loop;
end $$;
alter table public.flights add constraint flights_status_policy_check
  check (status in ('Activo', 'Retrasado', 'Cancelado', 'Reprogramado', 'Operado'));

create or replace function public.sigv_guard_flight_policy() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_departure timestamptz;
begin
  if tg_op = 'INSERT' then
    new.scheduled_departure := coalesce(new.scheduled_departure, new.departure);
    return new;
  end if;
  -- Los ajustes internos de inventario no son cambios operativos de un vuelo.
  if (new.origin,new.destination,new.flight_date,new.departure,new.arrival,new.status,new.gate,
      new.economy,new.first,new.capacity_economy,new.capacity_first,new.archived_at,
      new.scheduled_departure,new.taken_off_at,new.service_timezone)
    is not distinct from
     (old.origin,old.destination,old.flight_date,old.departure,old.arrival,old.status,old.gate,
      old.economy,old.first,old.capacity_economy,old.capacity_first,old.archived_at,
      old.scheduled_departure,old.taken_off_at,old.service_timezone) then return new; end if;
  if old.status in ('Cancelado','Reprogramado','Operado') then
    raise exception 'El vuelo está en estado terminal: %.', old.status;
  end if;
  v_departure := (old.flight_date + old.departure) at time zone old.service_timezone;
  if old.taken_off_at is null and now() > v_departure + interval '2 hours' and new.status <> 'Operado' then
    raise exception 'El vuelo está en estado terminal: Operado.';
  end if;
  if new.scheduled_departure is distinct from old.scheduled_departure then
    raise exception 'La salida programada no se modifica.';
  end if;
  if new.flight_date is distinct from old.flight_date and v_departure <= now() + interval '48 hours' then
    raise exception 'No se puede cambiar la fecha de servicio dentro de las próximas 48 horas.';
  end if;
  if new.departure = new.arrival then raise exception 'Los horarios de salida y llegada deben ser diferentes'; end if;
  if new.status in ('Activo','Retrasado') and (new.departure is distinct from old.departure or new.status is distinct from old.status) then
    if new.status='Retrasado' and new.departure<=old.scheduled_departure then
      raise exception 'La demora debe tener una hora posterior a la salida programada.';
    end if;
    new.status := case when new.departure > old.scheduled_departure then 'Retrasado' else 'Activo' end;
  end if;
  return new;
end $$;
drop trigger if exists sigv_guard_flight_policy on public.flights;
create trigger sigv_guard_flight_policy before insert or update on public.flights
for each row execute function public.sigv_guard_flight_policy();
revoke all on function public.sigv_guard_flight_policy() from public, anon, authenticated;

create or replace function public.sigv_close_due_flights() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if session_user <> 'postgres' and coalesce(public.sigv_role(),'') not in ('admin','mostrador') then
    raise exception 'Se requiere rol de mostrador';
  end if;
  update public.flights set status = 'Operado' where id in (
    select f.id from public.flights f where f.status in ('Activo','Retrasado')
      and f.taken_off_at is null and now() > ((f.flight_date + f.departure) at time zone f.service_timezone) + interval '2 hours'
    order by f.id for update skip locked);
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.sigv_close_due_flights() from public, anon, authenticated;
grant execute on function public.sigv_close_due_flights() to authenticated;

-- La misma guarda protege PATCH por la API y escrituras directas bajo RLS.
create or replace function public.sigv_apply_flight_change(p_flight_id text, p_changes jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_flight public.flights%rowtype; v_departure time; v_status text;
begin
  if coalesce(public.sigv_role(),'') <> 'admin' then raise exception 'Se requiere rol administrador'; end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then raise exception 'Cambios de vuelo inválidos.'; end if;
  perform id from public.reservations where flight_id=p_flight_id order by id for update;
  select * into v_flight from public.flights where id = p_flight_id for update;
  if not found then raise exception 'Vuelo no encontrado'; end if;
  if v_flight.status in ('Cancelado','Reprogramado','Operado') then
    raise exception 'El vuelo está en estado terminal: %.', v_flight.status;
  end if;
  v_departure := coalesce((p_changes->>'departure')::time, v_flight.departure);
  v_status := coalesce(p_changes->>'status',v_flight.status);
  if p_changes->>'status' = 'Retrasado' and not (p_changes ? 'departure') then
    raise exception 'Ingresá la nueva hora de salida para registrar la demora.';
  end if;
  if (p_changes ? 'departure' or p_changes ? 'status') and v_status = 'Retrasado' and v_departure <= v_flight.scheduled_departure then
    raise exception 'La demora debe tener una hora posterior a la salida programada.';
  end if;
  update public.flights set
    origin = coalesce(p_changes->>'origin',origin), destination = coalesce(p_changes->>'destination',destination),
    flight_date = coalesce((p_changes->>'flight_date')::date,flight_date), departure = v_departure,
    arrival = coalesce((p_changes->>'arrival')::time,arrival), status = v_status,
    gate = case when p_changes ? 'gate' then p_changes->>'gate' else gate end,
    archived_at = case when p_changes ? 'archived_at' then (p_changes->>'archived_at')::timestamptz else archived_at end,
    change_reason = case when p_changes ? 'reason' then p_changes->>'reason' else '' end
    where id = p_flight_id returning * into v_flight;
  return to_jsonb(v_flight);
end $$;
revoke all on function public.sigv_apply_flight_change(text,jsonb) from public, anon, authenticated;
grant execute on function public.sigv_apply_flight_change(text,jsonb) to authenticated;

-- El cierre automático no es una reprogramación ni una vuelta a Activo. Conserva
-- auditoría, pero evita el aviso heredado de "vuelve a operar normalmente".
drop trigger if exists sigv_flight_changed on public.flights;
create trigger sigv_flight_changed after update of status, flight_date, departure, arrival on public.flights
for each row when (new.status <> 'Operado' or (new.flight_date,new.departure,new.arrival)
  is distinct from (old.flight_date,old.departure,old.arrival)) execute function public.sigv_flight_changed();

-- Inventario comercial y ocupación física se consultan por separado, sin duplicar
-- contadores persistidos que puedan desincronizarse de las transacciones existentes.
create or replace function public.sigv_flight_inventory(p_flight_id text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if coalesce(public.sigv_role(),'') not in ('admin','mostrador') then raise exception 'Se requiere rol de mostrador'; end if;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.date,item."flightId"),'[]'::jsonb) into v_result from (
    select f.id as "flightId", f.flight_date as date,
      f.capacity_economy as "capacityEconomy",f.capacity_first as "capacityFirst",
      f.seats_economy as "seatsEconomy",f.seats_first as "seatsFirst",
      coalesce(s.economy,0) as "soldEconomy",coalesce(s.first,0) as "soldFirst",
      coalesce(s.economy,0)+coalesce(s.first,0) as "soldTotal",
      coalesce(a.economy,0) as "assignedEconomy",coalesce(a.first,0) as "assignedFirst"
    from public.flights f
    left join lateral (select
      sum(passenger_count) filter(where cabin='Economy') as economy,
      sum(passenger_count) filter(where cabin='Primera') as first
      from public.reservations where flight_id=f.id and status='Confirmada') s on true
    left join lateral (select count(*) filter(where cabin='Economy') as economy,
      count(*) filter(where cabin='Primera') as first
      from public.flight_seats where flight_id=f.id and status='Ocupado') a on true
    where (p_flight_id is null or f.id=p_flight_id) and f.archived_at is null
  ) item;
  return v_result;
end $$;
revoke all on function public.sigv_flight_inventory(text) from public, anon, authenticated;
grant execute on function public.sigv_flight_inventory(text) to authenticated;

-- Las firmas históricas de reserva/check-in también deben respetar los estados
-- nuevos; no alcanza con ocultarlos en el buscador o validar solo el pago.
create or replace function public.sigv_guard_passenger_flight() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_flight public.flights%rowtype;
begin
  if tg_table_name='reservation_passengers' then
    if new.checked_in_at is null then return new; end if;
  end if;
  select * into v_flight from public.flights where id=new.flight_id for update;
  if not found then raise exception 'Vuelo no disponible'; end if;
  if v_flight.status in ('Cancelado','Reprogramado','Operado') then
    raise exception 'El vuelo está en estado terminal: %.',v_flight.status;
  end if;
  if v_flight.taken_off_at is null and now()>((v_flight.flight_date+v_flight.departure) at time zone v_flight.service_timezone)+interval '2 hours' then
    raise exception 'El vuelo está en estado terminal: Operado.';
  end if;
  return new;
end $$;
drop trigger if exists sigv_guard_reservation_flight_policy on public.reservations;
create trigger sigv_guard_reservation_flight_policy before insert on public.reservations
for each row execute function public.sigv_guard_passenger_flight();
drop trigger if exists sigv_guard_check_in_flight_policy on public.reservation_passengers;
create trigger sigv_guard_check_in_flight_policy before update of checked_in_at,seat on public.reservation_passengers
for each row when (new.checked_in_at is distinct from old.checked_in_at or new.seat is distinct from old.seat)
execute function public.sigv_guard_passenger_flight();
revoke all on function public.sigv_guard_passenger_flight() from public,anon,authenticated;

-- Mantiene reserva -> vuelo -> pasajero -> asiento como orden de bloqueo para
-- que check-in no se cruce con un pago/cancelación o un cambio de vuelo.
create or replace function public.sigv_check_in(p_code text,p_document text,p_seat text,p_baggage_kg numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_reservation public.reservations%rowtype; v_flight public.flights%rowtype;
  v_person public.reservation_passengers%rowtype; v_seat public.flight_seats%rowtype;
begin
  if coalesce(public.sigv_role(),'') not in ('admin','mostrador') then raise exception 'Se requiere rol de mostrador'; end if;
  if p_baggage_kg is null or p_baggage_kg<0 or p_baggage_kg>40 then raise exception 'Equipaje inválido'; end if;
  select * into v_reservation from public.reservations where code=p_code for update;
  if not found then raise exception 'Reserva no encontrada'; end if;
  select * into v_flight from public.flights where id=v_reservation.flight_id for update;
  if v_flight.status='Cancelado' then raise exception 'El vuelo fue cancelado'; end if;
  if v_flight.status in ('Operado','Reprogramado') then raise exception 'El vuelo está en estado terminal: %.',v_flight.status; end if;
  if v_flight.archived_at is not null then raise exception 'El vuelo no está disponible'; end if;
  if v_reservation.status in ('Cancelada','A reagendar','A reembolsar') then raise exception 'La reserva ya está cancelada'; end if;
  if v_reservation.status<>'Confirmada' then raise exception 'Reserva confirmada no encontrada'; end if;
  select * into v_person from public.reservation_passengers where reservation_id=v_reservation.id and document=p_document for update;
  if not found then raise exception 'Documento no encontrado en la reserva'; end if;
  if v_person.checked_in_at is not null then raise exception 'El pasajero ya tiene check-in'; end if;
  select * into v_seat from public.flight_seats where flight_id=v_reservation.flight_id
    and code=upper(btrim(p_seat)) and cabin=v_reservation.cabin for update;
  if not found or v_seat.status<>'Disponible' then raise exception 'Asiento no disponible en la cabina'; end if;
  update public.flight_seats set status='Ocupado' where id=v_seat.id;
  update public.reservation_passengers set seat=v_seat.code,baggage_kg=p_baggage_kg,checked_in_at=now() where id=v_person.id;
  return jsonb_build_object('reservationCode',p_code,'seat',v_seat.code,'baggageKg',p_baggage_kg,
    'boardingPass','BP-'||upper(substr(replace(v_person.id::text,'-',''),1,10)));
end $$;
revoke all on function public.sigv_check_in(text,text,text,numeric) from public,anon,authenticated;
grant execute on function public.sigv_check_in(text,text,text,numeric) to authenticated;

-- Mantiene la firma pública anterior y agrega repetición segura de una aprobación.
create or replace function public.sigv_demo_payment_leg(p_code text, p_method text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_reservation public.reservations%rowtype; v_flight public.flights%rowtype; v_payment public.payments%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Iniciá sesión para pagar'; end if;
  if p_method not in ('Tarjeta de prueba','Transferencia de prueba') then raise exception 'Método de prueba inválido'; end if;
  select * into v_reservation from public.reservations where code=p_code and owner_id=(select auth.uid()) for update;
  if not found then raise exception 'Reserva no encontrada'; end if;
  if v_reservation.status='Confirmada' then
    select * into v_payment from public.payments where reservation_id=v_reservation.id;
    if found and v_payment.status='Aprobado (simulado)' then
      return jsonb_build_object('reservationCode',p_code,'status',v_payment.status,'invoice',v_payment.invoice,'replayed',true);
    end if;
  end if;
  if v_reservation.status<>'Pendiente de pago' then raise exception 'La reserva ya fue procesada'; end if;
  select * into v_flight from public.flights where id=v_reservation.flight_id for update;
  if v_flight.status not in ('Activo','Retrasado') or v_flight.archived_at is not null
    or (v_flight.taken_off_at is null and now() > ((v_flight.flight_date + v_flight.departure) at time zone v_flight.service_timezone) + interval '2 hours') then
    raise exception 'Vuelo no disponible';
  end if;
  if v_reservation.cabin='Economy' and v_flight.seats_economy<v_reservation.passenger_count then raise exception 'No hay suficientes asientos Economy'; end if;
  if v_reservation.cabin='Primera' and v_flight.seats_first<v_reservation.passenger_count then raise exception 'No hay suficientes asientos Primera'; end if;
  insert into public.payments(reservation_id,method,amount) values(v_reservation.id,p_method,v_reservation.total_amount) returning * into v_payment;
  if v_reservation.cabin='Economy' then
    update public.flights set seats_economy=seats_economy-v_reservation.passenger_count where id=v_flight.id;
  else
    update public.flights set seats_first=seats_first-v_reservation.passenger_count where id=v_flight.id;
  end if;
  update public.reservations set status='Confirmada' where id=v_reservation.id;
  return jsonb_build_object('reservationCode',p_code,'status',v_payment.status,'invoice',v_payment.invoice);
end $$;
revoke all on function public.sigv_demo_payment_leg(text,text) from public, anon, authenticated;
grant execute on function public.sigv_demo_payment_leg(text,text) to authenticated;

-- La tarjeta únicamente selecciona un resultado del simulador. No se registra.
-- El rechazo no crea pagos/facturas ni retenciones: las pendientes no consumen cupo.
create or replace function public.sigv_simulated_checkout(p_code text,p_method text,p_card_number text default null,p_return_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_selected public.reservations%rowtype; v_return public.reservations%rowtype; v_result jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Iniciá sesión para pagar'; end if;
  if p_method not in ('Tarjeta de prueba','Transferencia de prueba') then raise exception 'Método de prueba inválido'; end if;
  perform id from public.reservations where code in (p_code,p_return_code) order by id for update;
  select * into v_selected from public.reservations where code=p_code and owner_id=(select auth.uid());
  if not found then raise exception 'Reserva no encontrada'; end if;
  if p_return_code is not null then
    select * into v_return from public.reservations where code=p_return_code and owner_id=(select auth.uid());
    if not found or v_return.id=v_selected.id or v_selected.round_trip_id is null
      or v_return.round_trip_id is distinct from v_selected.round_trip_id then raise exception 'Las reservas de ida y vuelta no son válidas'; end if;
  end if;
  if v_selected.status='Pendiente de pago' and (p_return_code is null or v_return.status='Pendiente de pago')
    and p_method='Tarjeta de prueba' and regexp_replace(coalesce(p_card_number,''),'[^0-9]','','g')='4000000000000002' then
    return jsonb_build_object('reservationCode',p_code,'status','RECHAZADO');
  end if;
  if p_return_code is null then return public.sigv_demo_payment(p_code,p_method); end if;
  v_result := public.sigv_demo_round_trip_payment(p_code,p_return_code,p_method);
  return v_result || jsonb_build_object('replayed',coalesce((v_result->>'replayed')::boolean,false)
    and coalesce((v_result->'returnPayment'->>'replayed')::boolean,false));
end $$;
revoke all on function public.sigv_simulated_checkout(text,text,text,text) from public, anon, authenticated;
grant execute on function public.sigv_simulated_checkout(text,text,text,text) to authenticated;

-- El reembolso también es simulado. La cancelación existente devuelve inventario
-- únicamente para reservas Confirmadas; nunca vuelve a liberar una devolución.
create or replace function public.sigv_refund_reservation(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if coalesce(public.sigv_role(),'') <> 'admin' then raise exception 'Se requiere rol administrador'; end if;
  v_result := public.sigv_cancel_reservation(p_code);
  update public.payments p set status='Reembolsado (simulado)'
    from public.reservations r where r.id=p.reservation_id and r.status='Cancelada'
      and (r.code=p_code or r.round_trip_id=(select round_trip_id from public.reservations where code=p_code));
  return v_result || jsonb_build_object('refundStatus','Reembolsado (simulado)');
end $$;
revoke all on function public.sigv_refund_reservation(text) from public, anon, authenticated;
grant execute on function public.sigv_refund_reservation(text) to authenticated;

-- El cierre también se materializa al consultar Contingencias. Si pg_cron ya está
-- habilitado en este proyecto, se registra el mantenimiento periódico sin instalar
-- extensiones ni servicios externos desde esta migración.
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    if not exists(select 1 from cron.job where jobname='sigv-close-due-flights') then
      perform cron.schedule('sigv-close-due-flights','* * * * *','select public.sigv_close_due_flights()');
    end if;
  end if;
end $$;

commit;
