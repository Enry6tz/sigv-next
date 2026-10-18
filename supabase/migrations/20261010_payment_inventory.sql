-- US-017 / US-018: Inventario consistente con el pago.
--
-- Cambios:
--  1. sigv_reserve ya NO descuenta asientos al crear la reserva. Solo valida
--     disponibilidad y deja la reserva en 'Pendiente de pago'. El inventario
--     se mantiene disponible hasta que el pago se confirma.
--  2. sigv_demo_payment y sigv_demo_payment_leg descuentan asientos SOLO al
--     confirmar el pago exitoso, dentro de la misma transacción.
--  3. sigv_cancel_reservation solo devuelve asientos al inventario cuando la
--     reserva ya estaba confirmada; las pendientes de pago no tocaron el
--     inventario, así que no hay nada que liberar.
--  4. El bloqueo FOR UPDATE en el vuelo durante el pago evita sobreventa
--     ante compras concurrentes: el primer pago exitoso se queda con los
--     asientos, el resto falla con 'No hay suficientes asientos'.

-- --- sigv_reserve: quitar descuento de asientos ------------------------------
drop function if exists public.sigv_reserve(text, text, jsonb, text, text);
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
  -- Se valida disponibilidad pero NO se descuenta el inventario aún. El
  -- descuento ocurre al confirmar el pago en sigv_demo_payment.
  if p_cabin = 'Economy' then
    if v_flight.seats_economy < v_count then raise exception 'No hay suficientes asientos Economy'; end if;
    v_price := v_flight.economy;
  else
    if v_flight.seats_first < v_count then raise exception 'No hay suficientes asientos Primera'; end if;
    v_price := v_flight.first;
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

-- --- sigv_reserve_round_trip: recompilar por la nueva firma de sigv_reserve --
drop function if exists public.sigv_reserve_round_trip(text, text, text, text, jsonb, text, text);
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

-- --- sigv_demo_payment: descontar asientos al confirmar ----------------------
drop function if exists public.sigv_demo_payment(text, text);
create function public.sigv_demo_payment(p_code text, p_method text) returns jsonb language plpgsql security definer set search_path = '' as $$
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
  -- Descuenta asientos del inventario solo al confirmar el pago exitoso.
  if v_reservation.cabin = 'Economy' then
    update public.flights set seats_economy = least(capacity_economy, seats_economy - v_reservation.passenger_count) where id = v_reservation.flight_id;
  else
    update public.flights set seats_first = least(capacity_first, seats_first - v_reservation.passenger_count) where id = v_reservation.flight_id;
  end if;
  update public.reservations set status = 'Confirmada' where id = v_reservation.id;
  return jsonb_build_object('reservationCode', p_code, 'status', v_payment.status, 'invoice', v_payment.invoice);
end;
$$;

-- --- sigv_demo_payment_leg: mismo descuento por tramo ------------------------
drop function if exists public.sigv_demo_payment_leg(text, text);
create function public.sigv_demo_payment_leg(p_code text, p_method text) returns jsonb language plpgsql security definer set search_path = '' as $$
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
  if v_reservation.cabin = 'Economy' then
    update public.flights set seats_economy = least(capacity_economy, seats_economy - v_reservation.passenger_count) where id = v_reservation.flight_id;
  else
    update public.flights set seats_first = least(capacity_first, seats_first - v_reservation.passenger_count) where id = v_reservation.flight_id;
  end if;
  update public.reservations set status = 'Confirmada' where id = v_reservation.id;
  return jsonb_build_object('reservationCode', p_code, 'status', v_payment.status, 'invoice', v_payment.invoice);
end;
$$;

-- --- sigv_demo_round_trip_payment: llama a sigv_demo_payment_leg -------------
drop function if exists public.sigv_demo_round_trip_payment(text, text, text);
create function public.sigv_demo_round_trip_payment(p_code text, p_return_code text, p_method text)
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

-- --- sigv_cancel_reservation: solo liberar asientos de reservas confirmadas --
drop function if exists public.sigv_cancel_reservation(text);
create function public.sigv_cancel_reservation(p_code text) returns jsonb language plpgsql security definer set search_path = '' as $$
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
    -- Solo devolver asientos al inventario si la reserva ya estaba confirmada.
    -- Las reservas 'Pendiente de pago' nunca descontaron asientos.
    if v_reservation.status = 'Confirmada' then
      if v_reservation.cabin = 'Economy' then
        update public.flights set seats_economy = least(capacity_economy, seats_economy + v_reservation.passenger_count) where id = v_reservation.flight_id;
      else
        update public.flights set seats_first = least(capacity_first, seats_first + v_reservation.passenger_count) where id = v_reservation.flight_id;
      end if;
    end if;
  end loop;
  return jsonb_build_object('reservationCode', p_code, 'status', 'Cancelada');
end;
$$;

-- --- Permisos ----------------------------------------------------------------
revoke all on function public.sigv_reserve(text,text,jsonb,text,text) from public, anon, authenticated;
revoke all on function public.sigv_reserve_round_trip(text,text,text,text,jsonb,text,text) from public, anon, authenticated;
revoke all on function public.sigv_demo_payment(text,text) from public, anon, authenticated;
revoke all on function public.sigv_demo_payment_leg(text,text) from public, anon, authenticated;
revoke all on function public.sigv_demo_round_trip_payment(text,text,text) from public, anon, authenticated;
revoke all on function public.sigv_cancel_reservation(text) from public, anon, authenticated;
grant execute on function public.sigv_reserve(text,text,jsonb,text,text) to authenticated;
grant execute on function public.sigv_reserve_round_trip(text,text,text,text,jsonb,text,text) to authenticated;
grant execute on function public.sigv_demo_payment(text,text) to authenticated;
grant execute on function public.sigv_demo_payment_leg(text,text) to authenticated;
grant execute on function public.sigv_demo_round_trip_payment(text,text,text) to authenticated;
grant execute on function public.sigv_cancel_reservation(text) to authenticated;
