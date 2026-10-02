-- Inventario consistente ante cambios de capacidad, cancelaciones y archivo.
create or replace function public.sigv_set_capacity(p_flight_id text, p_economy integer, p_first integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_flight public.flights%rowtype;
  v_economy integer;
  v_first integer;
begin
  if public.sigv_role() <> 'admin' then raise exception 'Se requiere rol administrador'; end if;
  if p_economy < 0 or p_first < 0 then raise exception 'Los cupos no pueden ser negativos'; end if;
  select * into v_flight from public.flights where id = p_flight_id for update;
  if not found then raise exception 'Vuelo no encontrado'; end if;
  select coalesce(sum(passenger_count) filter (where cabin = 'Economy'), 0)::integer,
         coalesce(sum(passenger_count) filter (where cabin = 'Primera'), 0)::integer
    into v_economy, v_first from public.reservations
    where flight_id = p_flight_id and status <> 'Cancelada';
  if p_economy < v_economy or p_first < v_first then
    raise exception 'La capacidad no puede ser menor que los asientos reservados';
  end if;
  update public.flights set capacity_economy = p_economy, capacity_first = p_first,
    seats_economy = p_economy - v_economy, seats_first = p_first - v_first
    where id = p_flight_id;
  return jsonb_build_object('flightId', p_flight_id, 'economy', p_economy - v_economy,
    'first', p_first - v_first, 'capacityEconomy', p_economy, 'capacityFirst', p_first);
end;
$$;
revoke all on function public.sigv_set_capacity(text,integer,integer) from public, anon, authenticated;
grant execute on function public.sigv_set_capacity(text,integer,integer) to authenticated;

create or replace function public.sigv_flight_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_title text;
begin
  if (new.status, new.flight_date, new.departure, new.arrival)
     is distinct from (old.status, old.flight_date, old.departure, old.arrival) then
    v_title := case
      when new.status = 'Cancelado' then 'Tu vuelo ' || new.id || ' fue cancelado'
      when new.status = 'Retrasado' then 'Tu vuelo ' || new.id || ' registra una demora'
      else 'Tu vuelo ' || new.id || ' cambió de horario o estado'
    end;
    insert into public.notifications(owner_id, flight_id, title)
      select distinct owner_id, new.id, v_title
      from public.reservations where flight_id = new.id and status = 'Confirmada';
    if new.status = 'Cancelado' then
      update public.reservations set status = 'Cancelada'
      where flight_id = new.id and status <> 'Cancelada';
      update public.flights set seats_economy = capacity_economy, seats_first = capacity_first
        where id = new.id;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.sigv_guard_archive() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.archived_at is null and new.archived_at is not null and
    exists (select 1 from public.reservations where flight_id = new.id and status <> 'Cancelada') then
    raise exception 'Cancelá primero las reservas del vuelo';
  end if;
  return new;
end;
$$;
create trigger sigv_guard_flight_archive before update of archived_at on public.flights
  for each row execute function public.sigv_guard_archive();

create or replace function public.sigv_guard_airport_archive() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.archived_at is null and new.archived_at is not null and
    exists (select 1 from public.flights where archived_at is null and (origin = new.code or destination = new.code)) then
    raise exception 'El aeropuerto tiene vuelos activos';
  end if;
  return new;
end;
$$;
create trigger sigv_guard_airport_archive before update of archived_at on public.airports
  for each row execute function public.sigv_guard_airport_archive();

revoke delete on public.flights from authenticated;

create or replace function public.sigv_check_in(p_code text, p_document text, p_seat text, p_baggage_kg numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_reservation public.reservations%rowtype;
  v_person public.reservation_passengers%rowtype;
  v_flight public.flights%rowtype;
  v_row integer;
  v_max integer;
begin
  if public.sigv_role() not in ('admin', 'mostrador') then raise exception 'Se requiere rol de mostrador'; end if;
  if p_seat !~ '^[0-9]{1,2}[A-F]$' or p_baggage_kg is null or p_baggage_kg < 0 or p_baggage_kg > 40 then
    raise exception 'Asiento o equipaje inválido';
  end if;
  select * into v_reservation from public.reservations where code = p_code and status = 'Confirmada';
  if not found then raise exception 'Reserva confirmada no encontrada'; end if;
  select * into v_flight from public.flights where id = v_reservation.flight_id;
  if v_flight.status = 'Cancelado' or v_flight.archived_at is not null then raise exception 'El vuelo no está disponible'; end if;
  v_row := substring(p_seat from '^[0-9]+')::integer;
  v_max := case when v_reservation.cabin = 'Primera' then v_flight.capacity_first else v_flight.capacity_economy end;
  if (v_reservation.cabin = 'Primera' and v_row > 2) or
     (v_reservation.cabin = 'Economy' and v_row <= 2) or
     (v_reservation.cabin = 'Primera' and (v_row - 1) * 6 + ascii(right(p_seat, 1)) - 64 > v_max) or
     (v_reservation.cabin = 'Economy' and (v_row - 3) * 6 + ascii(right(p_seat, 1)) - 64 > v_max) then
    raise exception 'El asiento no pertenece a la cabina o supera su capacidad';
  end if;
  select * into v_person from public.reservation_passengers
    where reservation_id = v_reservation.id and document = p_document for update;
  if not found then raise exception 'Documento no encontrado en la reserva'; end if;
  if v_person.checked_in_at is not null then raise exception 'El pasajero ya tiene check-in'; end if;
  update public.reservation_passengers set seat = p_seat, baggage_kg = p_baggage_kg, checked_in_at = now()
    where id = v_person.id;
  return jsonb_build_object('reservationCode', p_code, 'seat', p_seat, 'baggageKg', p_baggage_kg,
    'boardingPass', 'BP-' || upper(substr(replace(v_person.id::text, '-', ''), 1, 10)));
end;
$$;
