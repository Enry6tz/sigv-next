-- US-023: política 'A reagendar' / 'A reembolsar', avisos con opciones y auditoría
-- de reservas afectadas.
--
-- Cambios:
--  1. reservations.status admite 'A reagendar' y 'A reembolsar'.
--  2. Al cancelar un vuelo (criterio 1), cada reserva confirmada pasa a:
--       'A reagendar'  si la misma ruta tiene otro vuelo vendible (no cancelado,
--                      sin archivar, desde hoy) con lugar en su cabina para todos
--                      sus pasajeros;
--       'A reembolsar' si no hay alternativa.
--     Las reservas 'Pendiente de pago' no se cobraron: pasan a 'Cancelada'.
--     El inventario del vuelo cancelado se libera como antes.
--  3. Cada reserva afectada genera un aviso con el cambio y las opciones del
--     pasajero (criterio 3). En reprogramaciones y demoras la reserva conserva sus
--     asientos; si el pasajero no acepta, la cancela desde Mis reservas y el
--     inventario se libera (criterio 2).
--  4. flight_change_logs recibe una fila 'reservas_afectadas' con cada reserva y su
--     estado resultante, junto al usuario y la fecha del cambio (criterio 4).
--  5. Queda un único trigger, sigv_flight_changed. Según el orden de aplicación,
--     las migraciones anteriores podían dejar también sigv_flight_status_changed.
--  Todo opera por conjuntos, sin recorrer reservas una a una (criterio 5).

do $$
declare
  v_name text;
begin
  for v_name in select conname from pg_constraint
    where conrelid = 'public.reservations'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%Pendiente de pago%'
  loop
    execute format('alter table public.reservations drop constraint %I', v_name);
  end loop;
end;
$$;
alter table public.reservations add constraint reservations_status_check
  check (status in ('Pendiente de pago', 'Confirmada', 'Cancelada', 'A reagendar', 'A reembolsar'));

create or replace function public.sigv_flight_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := case when new.schedule_id is null then new.id else regexp_replace(new.id, '-[0-9]{8}$', '') end;
  v_when text := to_char(new.flight_date, 'DD/MM/YYYY') || ' ' || left(new.departure::text, 5);
  v_economy integer;
  v_first integer;
  v_change text;
  v_affected text;
begin
  if (new.status, new.flight_date, new.departure, new.arrival)
     is not distinct from (old.status, old.flight_date, old.departure, old.arrival) then
    return new;
  end if;

  if new.status = 'Cancelado' and old.status is distinct from 'Cancelado' then
    -- Mayor cupo libre por cabina entre los vuelos alternativos de la misma ruta.
    select coalesce(max(f.seats_economy), 0), coalesce(max(f.seats_first), 0) into v_economy, v_first
      from public.flights f
      where f.id <> new.id and f.origin = new.origin and f.destination = new.destination
        and f.status <> 'Cancelado' and f.archived_at is null and f.flight_date >= current_date;

    with changed as (
      update public.reservations r set status = case
          when r.status = 'Pendiente de pago' then 'Cancelada'
          when r.passenger_count <= case when r.cabin = 'Economy' then v_economy else v_first end then 'A reagendar'
          else 'A reembolsar' end
        where r.flight_id = new.id and r.status in ('Confirmada', 'Pendiente de pago')
        returning r.code, r.owner_id, r.status
    ), notified as (
      insert into public.notifications(owner_id, flight_id, title)
        select owner_id, new.id, 'Tu vuelo ' || v_code || ' del ' || v_when || ' fue cancelado. Reserva ' || code || ': ' ||
          case status
            when 'A reagendar' then 'A reagendar. Hay otros vuelos en la ruta: comunicate con SIGV para elegir el nuevo vuelo o pedir el reembolso.'
            when 'A reembolsar' then 'A reembolsar. No hay vuelos alternativos en la ruta: te reintegraremos el importe pagado.'
            else 'cancelada. Estaba pendiente de pago, así que no se te cobró nada.' end
        from changed
    )
    select string_agg(code || ': ' || status, ', ' order by code) into v_affected from changed;

    update public.flights set seats_economy = capacity_economy, seats_first = capacity_first where id = new.id;
  else
    v_change := case
      when (new.flight_date, new.departure, new.arrival) is distinct from (old.flight_date, old.departure, old.arrival)
        then 'fue reprogramado para el ' || v_when || '. Conservás tus asientos; si no aceptás el cambio, cancelá la reserva desde Mis reservas y se liberan tus asientos.'
      when new.status = 'Retrasado'
        then 'del ' || v_when || ' registra una demora. La reserva sigue confirmada; si no te sirve, podés cancelarla desde Mis reservas.'
      else 'del ' || v_when || ' vuelve a operar normalmente. La reserva sigue confirmada.' end;

    with notified as (
      insert into public.notifications(owner_id, flight_id, title)
        select r.owner_id, new.id, 'Tu vuelo ' || v_code || ' ' || v_change || ' Reserva ' || r.code || '.'
        from public.reservations r where r.flight_id = new.id and r.status = 'Confirmada'
        returning 1
    )
    select string_agg(r.code || ': ' || r.status, ', ' order by r.code) into v_affected
      from public.reservations r where r.flight_id = new.id and r.status = 'Confirmada';
  end if;

  if v_affected is not null then
    insert into public.flight_change_logs(flight_id, actor_id, field, old_value, new_value)
      values (new.id, (select auth.uid()), 'reservas_afectadas', null, v_affected);
  end if;
  return new;
end;
$$;
revoke all on function public.sigv_flight_changed() from public, anon, authenticated;

drop trigger if exists sigv_flight_status_changed on public.flights;
drop trigger if exists sigv_flight_changed on public.flights;
create trigger sigv_flight_changed after update of status, flight_date, departure, arrival on public.flights
  for each row execute function public.sigv_flight_changed();
