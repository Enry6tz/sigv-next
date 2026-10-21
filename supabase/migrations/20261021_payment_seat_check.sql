-- US-017 / US-018 (criterio 3): el pago valida el cupo con el vuelo bloqueado.
--
-- 20261010_payment_inventory.sql descuenta asientos al confirmar el pago, pero no
-- comprobaba que siguieran disponibles: si dos compradores pagaban los últimos
-- asientos a la vez, el segundo chocaba con el CHECK seats_* >= 0 y recibía un
-- error genérico. Ahora cada tramo bloquea su vuelo (FOR UPDATE), verifica el cupo
-- y responde 'No hay suficientes asientos …' al que llega tarde. Ese pago no deja
-- rastro: la reserva sigue 'Pendiente de pago' y el inventario no cambia.
--
-- Aplicar después de 20261010_payment_inventory.sql.

create or replace function public.sigv_demo_payment_leg(p_code text, p_method text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_reservation public.reservations%rowtype;
  v_flight public.flights%rowtype;
  v_payment public.payments%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Iniciá sesión para pagar'; end if;
  select * into v_reservation from public.reservations where code = p_code and owner_id = (select auth.uid()) for update;
  if not found then raise exception 'Reserva no encontrada'; end if;
  if v_reservation.status <> 'Pendiente de pago' then raise exception 'La reserva ya fue procesada'; end if;
  if p_method not in ('Tarjeta de prueba', 'Transferencia de prueba') then raise exception 'Método de prueba inválido'; end if;
  select * into v_flight from public.flights where id = v_reservation.flight_id for update;
  if v_flight.status = 'Cancelado' or v_flight.archived_at is not null then raise exception 'Vuelo no disponible'; end if;
  if v_reservation.cabin = 'Economy' and v_flight.seats_economy < v_reservation.passenger_count then
    raise exception 'No hay suficientes asientos Economy';
  end if;
  if v_reservation.cabin = 'Primera' and v_flight.seats_first < v_reservation.passenger_count then
    raise exception 'No hay suficientes asientos Primera';
  end if;
  insert into public.payments(reservation_id, method, amount)
  values (v_reservation.id, p_method, v_reservation.total_amount) returning * into v_payment;
  if v_reservation.cabin = 'Economy' then
    update public.flights set seats_economy = seats_economy - v_reservation.passenger_count where id = v_flight.id;
  else
    update public.flights set seats_first = seats_first - v_reservation.passenger_count where id = v_flight.id;
  end if;
  update public.reservations set status = 'Confirmada' where id = v_reservation.id;
  return jsonb_build_object('reservationCode', p_code, 'status', v_payment.status, 'invoice', v_payment.invoice);
end;
$$;

-- Un tramo y un pago simple son la misma operación.
create or replace function public.sigv_demo_payment(p_code text, p_method text) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.sigv_demo_payment_leg(p_code, p_method);
end;
$$;

-- Bloquea ambos vuelos en orden de id antes de pagar los tramos, igual que
-- sigv_reserve_round_trip, para que dos viajes con rutas inversas no se bloqueen
-- mutuamente.
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
  perform id from public.flights where id in (v_outbound.flight_id, v_return.flight_id) order by id for update;
  v_payment := public.sigv_demo_payment_leg(p_code, p_method);
  v_return_payment := public.sigv_demo_payment_leg(p_return_code, p_method);
  return v_payment || jsonb_build_object('returnPayment', v_return_payment);
end;
$$;

revoke all on function public.sigv_demo_payment(text,text) from public, anon, authenticated;
revoke all on function public.sigv_demo_payment_leg(text,text) from public, anon, authenticated;
revoke all on function public.sigv_demo_round_trip_payment(text,text,text) from public, anon, authenticated;
grant execute on function public.sigv_demo_payment(text,text) to authenticated;
grant execute on function public.sigv_demo_payment_leg(text,text) to authenticated;
grant execute on function public.sigv_demo_round_trip_payment(text,text,text) to authenticated;

-- Cupos: desde 20261010 solo las reservas pagadas ocupan inventario, así que el
-- recálculo de asientos libres al cambiar la capacidad cuenta solo las confirmadas.
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
    where flight_id = p_flight_id and status = 'Confirmada';
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
