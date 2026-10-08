-- Contacto del comprador en cada reserva + formato de documento normalizado.
--
-- Cambios:
--  1. reservations gana contact_email/contact_phone.
--  2. sigv_reserve y sigv_reserve_round_trip pasan a exigir y almacenar el
--     contacto del comprador, normalizan el documento (sin puntos ni espacios)
--     y validan formato: 6-8 dígitos por pasajero.
--  3. Ningún documento puede tener dos asientos en vuelos no cancelados.
--  4. Constraints CHECK NOT VALID: se aplican a escrituras nuevas sin
--     bloquear filas históricas semilla.
--
-- IMPORTA: al redefinir las funciones con parámetros extra con valores por
-- defecto, un llamado sin contacto fallará con 'Ingresá un correo electrónico
-- válido.'. Aplicar esta migración ANTES de desplegar el cliente que la envía.

alter table public.reservations add column if not exists contact_email text;
alter table public.reservations add column if not exists contact_phone text;

alter table public.reservations drop constraint if exists reservations_contact_email_format;
alter table public.reservations
  add constraint reservations_contact_email_format
  check (contact_email is null or contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') not valid;

alter table public.reservation_passengers drop constraint if exists reservation_passengers_document_format;
alter table public.reservation_passengers
  add constraint reservation_passengers_document_format
  check (document ~ '^[0-9]{6,8}$') not valid;

drop function if exists public.sigv_reserve(text, text, jsonb);
create function public.sigv_reserve(
  p_flight_id text, p_cabin text, p_passengers jsonb,
  p_contact_email text default null, p_contact_phone text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_flight public.flights%rowtype;
  v_reservation public.reservations%rowtype;
  v_count integer;
  v_person jsonb;
  v_price numeric(12,2);
  v_first_name text;
  v_last_name text;
  v_document text;
  v_email text := lower(btrim(coalesce(p_contact_email, '')));
  v_phone text := btrim(coalesce(p_contact_phone, ''));
begin
  if (select auth.uid()) is null then raise exception 'Iniciá sesión para reservar'; end if;
  if jsonb_typeof(p_passengers) is distinct from 'array' then raise exception 'Pasajeros inválidos'; end if;
  v_count := jsonb_array_length(p_passengers);
  if v_count not between 1 and 9 then raise exception 'La compra admite entre 1 y 9 pasajeros'; end if;
  if p_cabin not in ('Economy', 'Primera') then raise exception 'Cabina inválida'; end if;
  if (select count(*) from (select distinct lower(regexp_replace(btrim(coalesce(value ->> 'document', '')), '[\s.\-]', '', 'g'))
      from jsonb_array_elements(p_passengers)) x) <> v_count then
    raise exception 'Cada pasajero debe tener un documento diferente';
  end if;
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Ingresá un correo electrónico válido.';
  end if;
  if v_phone <> '' and (v_phone !~ '^[0-9+\s()\-]{6,20}$' or length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 6) then
    raise exception 'El teléfono debe tener entre 6 y 15 dígitos. Se admiten espacios, paréntesis, guiones y el prefijo +.';
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
    v_first_name := btrim(coalesce(v_person ->> 'firstName', ''));
    v_last_name := btrim(coalesce(v_person ->> 'lastName', ''));
    v_document := regexp_replace(btrim(coalesce(v_person ->> 'document', '')), '[\s.\-]', '', 'g');
    if v_first_name = '' or v_last_name = '' or v_document = '' then
      raise exception 'Completá nombre, apellido y documento de cada pasajero';
    end if;
    if v_document !~ '^[0-9]{6,8}$' then
      raise exception 'El documento debe tener entre 6 y 8 dígitos, sin letras ni espacios.';
    end if;
    if exists (
      select 1 from public.reservation_passengers rp
      join public.reservations r on r.id = rp.reservation_id
      where rp.flight_id = p_flight_id and r.status <> 'Cancelada' and rp.document = v_document
    ) then
      raise exception 'Ese documento ya tiene un pasaje para este vuelo.';
    end if;
  end loop;
  insert into public.reservations(owner_id, flight_id, cabin, passenger_count, total_amount, contact_email, contact_phone)
  values ((select auth.uid()), p_flight_id, p_cabin, v_count, v_price * v_count, v_email, nullif(v_phone, ''))
  returning * into v_reservation;
  for v_person in select value from jsonb_array_elements(p_passengers) loop
    insert into public.reservation_passengers(reservation_id, flight_id, first_name, last_name, document)
    values (v_reservation.id, p_flight_id, btrim(v_person ->> 'firstName'), btrim(v_person ->> 'lastName'),
      regexp_replace(btrim(v_person ->> 'document'), '[\s.\-]', '', 'g'));
  end loop;
  return jsonb_build_object('code', v_reservation.code, 'flightId', p_flight_id, 'cabin', p_cabin,
    'seats', v_count, 'status', v_reservation.status, 'totalAmount', v_reservation.total_amount);
end;
$$;

drop function if exists public.sigv_reserve_round_trip(text, text, text, text, jsonb);
create function public.sigv_reserve_round_trip(
  p_flight_id text, p_cabin text, p_return_flight_id text, p_return_cabin text, p_passengers jsonb,
  p_contact_email text default null, p_contact_phone text default null
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
  v_reservation := public.sigv_reserve(p_flight_id, p_cabin, p_passengers, p_contact_email, p_contact_phone);
  v_return_reservation := public.sigv_reserve(p_return_flight_id, p_return_cabin, p_passengers, p_contact_email, p_contact_phone);
  update public.reservations set round_trip_id = v_trip where code in (v_reservation->>'code', v_return_reservation->>'code');
  return v_reservation || jsonb_build_object('returnReservation', v_return_reservation);
end;
$$;

revoke all on function public.sigv_reserve(text,text,jsonb,text,text) from public, anon, authenticated;
revoke all on function public.sigv_reserve_round_trip(text,text,text,text,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.sigv_reserve(text,text,jsonb,text,text) to authenticated;
grant execute on function public.sigv_reserve_round_trip(text,text,text,text,jsonb,text,text) to authenticated;
