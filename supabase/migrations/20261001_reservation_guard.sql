-- Refuerza la validación de reserva para vuelos archivados y documentos repetidos.
create or replace function public.sigv_reserve(p_flight_id text, p_cabin text, p_passengers jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_flight public.flights%rowtype;
  v_reservation public.reservations%rowtype;
  v_count integer;
  v_person jsonb;
  v_price numeric(12,2);
begin
  if (select auth.uid()) is null then raise exception 'Iniciá sesión para reservar'; end if;
  if jsonb_typeof(p_passengers) is distinct from 'array' then raise exception 'Pasajeros inválidos'; end if;
  v_count := jsonb_array_length(p_passengers);
  if v_count not between 1 and 9 then raise exception 'La compra admite entre 1 y 9 pasajeros'; end if;
  if p_cabin not in ('Economy', 'Primera') then raise exception 'Cabina inválida'; end if;
  if (select count(*) from (select distinct lower(trim(value ->> 'document'))
      from jsonb_array_elements(p_passengers)) x) <> v_count then
    raise exception 'Cada pasajero debe tener un documento diferente';
  end if;
  select * into v_flight from public.flights where id = p_flight_id for update;
  if not found or v_flight.archived_at is not null or v_flight.status = 'Cancelado'
      or v_flight.flight_date < current_date then
    raise exception 'Vuelo no disponible';
  end if;
  if p_cabin = 'Economy' then
    if v_flight.seats_economy < v_count then raise exception 'No hay suficientes asientos Economy'; end if;
    v_price := v_flight.economy;
    update public.flights set seats_economy = seats_economy - v_count where id = p_flight_id;
  else
    if v_flight.seats_first < v_count then raise exception 'No hay suficientes asientos Primera'; end if;
    v_price := v_flight.first;
    update public.flights set seats_first = seats_first - v_count where id = p_flight_id;
  end if;
  for v_person in select value from jsonb_array_elements(p_passengers) loop
    if length(trim(coalesce(v_person ->> 'firstName', ''))) = 0
      or length(trim(coalesce(v_person ->> 'lastName', ''))) = 0
      or length(trim(coalesce(v_person ->> 'document', ''))) = 0 then
      raise exception 'Completá nombre, apellido y documento de cada pasajero';
    end if;
  end loop;
  insert into public.reservations(owner_id, flight_id, cabin, passenger_count, total_amount)
  values ((select auth.uid()), p_flight_id, p_cabin, v_count, v_price * v_count)
  returning * into v_reservation;
  for v_person in select value from jsonb_array_elements(p_passengers) loop
    insert into public.reservation_passengers(reservation_id, flight_id, first_name, last_name, document)
    values (v_reservation.id, p_flight_id, trim(v_person ->> 'firstName'), trim(v_person ->> 'lastName'), trim(v_person ->> 'document'));
  end loop;
  return jsonb_build_object('code', v_reservation.code, 'flightId', p_flight_id, 'cabin', p_cabin,
    'seats', v_count, 'status', v_reservation.status, 'totalAmount', v_reservation.total_amount);
end;
$$;
