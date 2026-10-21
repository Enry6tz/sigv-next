-- US-021: check-in contra el mapa de asientos, sin depender del orden de migraciones.
--
-- 20261001_domain_model.sql y 20261001_inventory.sql definen sigv_check_in de forma
-- distinta y comparten prefijo de fecha, así que la versión vigente dependía del
-- orden de aplicación. La de inventory.sql no marca el asiento como 'Ocupado' en
-- flight_seats: el mapa seguía mostrándolo libre. Esta versión es la definitiva:
--  1. Toma el asiento de flight_seats con FOR UPDATE y exige que esté 'Disponible'
--     y pertenezca a la cabina contratada (criterios 2, 3 y 4).
--  2. Lo marca 'Ocupado' y lo asigna al pasajero en la misma transacción.
--  3. Explica por qué no se puede hacer el check-in de un pasaje o vuelo cancelado,
--     sin reservar ningún asiento (criterio 5).

create or replace function public.sigv_check_in(p_code text, p_document text, p_seat text, p_baggage_kg numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_reservation public.reservations%rowtype;
  v_flight public.flights%rowtype;
  v_person public.reservation_passengers%rowtype;
  v_seat public.flight_seats%rowtype;
begin
  if public.sigv_role() not in ('admin', 'mostrador') then raise exception 'Se requiere rol de mostrador'; end if;
  if p_baggage_kg is null or p_baggage_kg < 0 or p_baggage_kg > 40 then raise exception 'Equipaje inválido'; end if;
  select * into v_reservation from public.reservations where code = p_code;
  if not found then raise exception 'Reserva no encontrada'; end if;
  select * into v_flight from public.flights where id = v_reservation.flight_id;
  if v_flight.status = 'Cancelado' then raise exception 'El vuelo fue cancelado'; end if;
  if v_flight.archived_at is not null then raise exception 'El vuelo no está disponible'; end if;
  if v_reservation.status in ('Cancelada', 'A reagendar', 'A reembolsar') then raise exception 'La reserva ya está cancelada'; end if;
  if v_reservation.status <> 'Confirmada' then raise exception 'Reserva confirmada no encontrada'; end if;
  select * into v_person from public.reservation_passengers
    where reservation_id = v_reservation.id and document = p_document for update;
  if not found then raise exception 'Documento no encontrado en la reserva'; end if;
  if v_person.checked_in_at is not null then raise exception 'El pasajero ya tiene check-in'; end if;
  select * into v_seat from public.flight_seats
    where flight_id = v_reservation.flight_id and code = upper(btrim(p_seat)) and cabin = v_reservation.cabin for update;
  if not found or v_seat.status <> 'Disponible' then raise exception 'Asiento no disponible en la cabina'; end if;
  update public.flight_seats set status = 'Ocupado' where id = v_seat.id;
  update public.reservation_passengers set seat = v_seat.code, baggage_kg = p_baggage_kg, checked_in_at = now()
    where id = v_person.id;
  return jsonb_build_object('reservationCode', p_code, 'seat', v_seat.code, 'baggageKg', p_baggage_kg,
    'boardingPass', 'BP-' || upper(substr(replace(v_person.id::text, '-', ''), 1, 10)));
end;
$$;

-- Asientos asignados por la versión anterior que quedaron libres en el mapa.
update public.flight_seats s set status = 'Ocupado'
  from public.reservation_passengers p
  where p.flight_id = s.flight_id and p.seat = s.code and p.checked_in_at is not null and s.status <> 'Ocupado';

revoke all on function public.sigv_check_in(text,text,text,numeric) from public, anon, authenticated;
grant execute on function public.sigv_check_in(text,text,text,numeric) to authenticated;
