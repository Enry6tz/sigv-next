-- Reserva y pago de prueba de ambos tramos en una única transacción.
alter table public.reservations add column if not exists round_trip_id uuid;
create index if not exists reservations_round_trip on public.reservations(round_trip_id) where round_trip_id is not null;

create or replace function public.sigv_reserve_round_trip(
  p_flight_id text, p_cabin text, p_return_flight_id text, p_return_cabin text, p_passengers jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_outbound public.flights%rowtype;
  v_return public.flights%rowtype;
  v_reservation jsonb;
  v_return_reservation jsonb;
  v_trip uuid := gen_random_uuid();
begin
  if (select auth.uid()) is null then raise exception 'Iniciá sesión para reservar'; end if;
  -- Orden consistente para evitar bloqueos cruzados entre compras concurrentes.
  perform id from public.flights where id in (p_flight_id, p_return_flight_id) order by id for update;
  select * into v_outbound from public.flights where id = p_flight_id;
  select * into v_return from public.flights where id = p_return_flight_id;
  if v_outbound.id is null or v_return.id is null or v_outbound.id = v_return.id
    or v_outbound.origin <> v_return.destination or v_outbound.destination <> v_return.origin
    or (v_return.flight_date + v_return.departure) <=
      (v_outbound.flight_date + v_outbound.arrival + case when v_outbound.arrival < v_outbound.departure then interval '1 day' else interval '0 days' end)
  then raise exception 'Seleccioná un regreso por la ruta inversa después de la llegada de la ida'; end if;
  v_reservation := public.sigv_reserve(p_flight_id, p_cabin, p_passengers);
  v_return_reservation := public.sigv_reserve(p_return_flight_id, p_return_cabin, p_passengers);
  update public.reservations set round_trip_id = v_trip where code in (v_reservation->>'code', v_return_reservation->>'code');
  return v_reservation || jsonb_build_object('returnReservation', v_return_reservation);
end;
$$;

-- Función interna: solo las funciones de pago públicas pueden invocarla.
create or replace function public.sigv_demo_payment_leg(p_code text, p_method text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_reservation public.reservations%rowtype;
  v_payment public.payments%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Iniciá sesión para pagar'; end if;
  select * into v_reservation from public.reservations where code = p_code and owner_id = (select auth.uid()) for update;
  if not found then raise exception 'Reserva no encontrada'; end if;
  if v_reservation.status <> 'Pendiente de pago' then raise exception 'La reserva ya fue procesada'; end if;
  if p_method not in ('Tarjeta de prueba', 'Transferencia de prueba') then raise exception 'Método de prueba inválido'; end if;
  insert into public.payments(reservation_id, method, amount)
    values (v_reservation.id, p_method, v_reservation.total_amount) returning * into v_payment;
  update public.reservations set status = 'Confirmada' where id = v_reservation.id;
  return jsonb_build_object('reservationCode', p_code, 'status', v_payment.status, 'invoice', v_payment.invoice);
end;
$$;
revoke all on function public.sigv_demo_payment_leg(text,text) from public, anon, authenticated;

create or replace function public.sigv_demo_round_trip_payment(p_code text, p_return_code text, p_method text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_outbound public.reservations%rowtype;
  v_return public.reservations%rowtype;
  v_payment jsonb;
  v_return_payment jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Iniciá sesión para pagar'; end if;
  perform id from public.reservations where code in (p_code, p_return_code) order by id for update;
  select * into v_outbound from public.reservations where code = p_code and owner_id = (select auth.uid());
  select * into v_return from public.reservations where code = p_return_code and owner_id = (select auth.uid());
  if v_outbound.id is null or v_return.id is null or v_outbound.id = v_return.id
    or v_outbound.round_trip_id is null or v_outbound.round_trip_id is distinct from v_return.round_trip_id then
    raise exception 'Las reservas de ida y vuelta no son válidas';
  end if;
  v_payment := public.sigv_demo_payment_leg(p_code, p_method);
  v_return_payment := public.sigv_demo_payment_leg(p_return_code, p_method);
  return v_payment || jsonb_build_object('returnPayment', v_return_payment);
end;
$$;

-- Reanudar desde una sola reserva también paga ambos tramos de su viaje.
create or replace function public.sigv_demo_payment(p_code text, p_method text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_trip uuid;
  v_other_code text;
begin
  if (select auth.uid()) is null then raise exception 'Iniciá sesión para pagar'; end if;
  select round_trip_id into v_trip from public.reservations where code = p_code and owner_id = (select auth.uid());
  if not found then raise exception 'Reserva no encontrada'; end if;
  if v_trip is null then return public.sigv_demo_payment_leg(p_code, p_method); end if;
  select code into v_other_code from public.reservations where round_trip_id = v_trip and code <> p_code and owner_id = (select auth.uid());
  if not found then raise exception 'Las reservas de ida y vuelta no son válidas'; end if;
  return public.sigv_demo_round_trip_payment(p_code, v_other_code, p_method);
end;
$$;

revoke all on function public.sigv_reserve_round_trip(text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.sigv_demo_round_trip_payment(text,text,text) from public, anon, authenticated;
grant execute on function public.sigv_reserve_round_trip(text,text,text,text,jsonb) to authenticated;
grant execute on function public.sigv_demo_round_trip_payment(text,text,text) to authenticated;

-- Cancelar un viaje vinculado libera los cupos de ambos tramos de forma atómica.
create or replace function public.sigv_cancel_reservation(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_selected public.reservations%rowtype;
  v_reservation public.reservations%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Iniciá sesión para cancelar'; end if;
  select * into v_selected from public.reservations where code = p_code;
  if not found then raise exception 'Reserva no encontrada'; end if;
  perform id from public.reservations where id = v_selected.id or round_trip_id = v_selected.round_trip_id order by id for update;
  select * into v_selected from public.reservations where code = p_code;
  if v_selected.status = 'Cancelada' then raise exception 'La reserva ya está cancelada'; end if;
  perform id from public.flights where id in (
    select flight_id from public.reservations where id = v_selected.id or round_trip_id = v_selected.round_trip_id
  ) order by id for update;
  for v_reservation in select * from public.reservations
    where id = v_selected.id or round_trip_id = v_selected.round_trip_id order by id
  loop
    if v_reservation.owner_id <> (select auth.uid()) and public.sigv_role() <> 'admin' then
      raise exception 'No tenés permiso sobre esta reserva';
    end if;
    if v_reservation.status = 'Cancelada' then continue; end if;
    if exists(select 1 from public.reservation_passengers where reservation_id = v_reservation.id and checked_in_at is not null) then
      raise exception 'No se puede cancelar una reserva con check-in';
    end if;
    update public.reservations set status = 'Cancelada' where id = v_reservation.id;
    if v_reservation.cabin = 'Economy' then
      update public.flights set seats_economy = least(capacity_economy, seats_economy + v_reservation.passenger_count) where id = v_reservation.flight_id;
    else
      update public.flights set seats_first = least(capacity_first, seats_first + v_reservation.passenger_count) where id = v_reservation.flight_id;
    end if;
  end loop;
  return jsonb_build_object('reservationCode', p_code, 'status', 'Cancelada');
end;
$$;
