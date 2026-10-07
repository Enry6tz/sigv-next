-- Ejecutar con la migración round_trip aplicada. No conserva datos de prueba.
begin;
do $$
declare
  v_user uuid;
  v_booking jsonb;
  v_payment jsonb;
  v_people jsonb := '[{"firstName":"Prueba","lastName":"Uno","document":"QA-ROUND-1"},{"firstName":"Prueba","lastName":"Dos","document":"QA-ROUND-2"}]';
begin
  if has_function_privilege('authenticated','public.sigv_demo_payment_leg(text,text)','execute')
    or has_function_privilege('anon','public.sigv_reserve_round_trip(text,text,text,text,jsonb)','execute')
    or has_function_privilege('anon','public.sigv_demo_round_trip_payment(text,text,text)','execute') then raise exception 'TEST: permisos públicos excesivos'; end if;
  select user_id into strict v_user from public.profiles limit 1;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',v_user,'role','authenticated')::text, true);
  insert into public.flights(id,origin,destination,flight_date,departure,arrival,economy,first,seats_economy,seats_first,capacity_economy,capacity_first,is_demo)
    values ('QA-ROUND-OUT','EZE','BRC',current_date+30,'09:00','11:00',100,250,4,4,4,4,true),
           ('QA-ROUND-BACK','BRC','EZE',current_date+35,'12:00','14:00',150,350,4,1,4,1,true);
  begin
    perform public.sigv_reserve_round_trip('QA-ROUND-OUT','Economy','QA-ROUND-BACK','Primera',v_people);
    raise exception 'TEST: permitió regreso sin cupos';
  exception when raise_exception then
    if sqlerrm <> 'No hay suficientes asientos Primera' then raise; end if;
  end;
  if (select seats_economy from public.flights where id='QA-ROUND-OUT') <> 4
    or exists(select 1 from public.reservations where flight_id in ('QA-ROUND-OUT','QA-ROUND-BACK')) then
    raise exception 'TEST: no revirtió ida al fallar vuelta';
  end if;
  begin
    perform public.sigv_reserve_round_trip('QA-ROUND-BACK','Economy','QA-ROUND-OUT','Economy',v_people);
    raise exception 'TEST: permitió regreso antes de ida';
  exception when raise_exception then
    if sqlerrm <> 'Seleccioná un regreso por la ruta inversa después de la llegada de la ida' then raise; end if;
  end;
  v_booking := public.sigv_reserve_round_trip('QA-ROUND-OUT','Primera','QA-ROUND-BACK','Economy',v_people);
  if (select count(*) from public.reservations where flight_id in ('QA-ROUND-OUT','QA-ROUND-BACK')) <> 2
    or (v_booking->>'totalAmount')::numeric <> 500
    or (v_booking->'returnReservation'->>'totalAmount')::numeric <> 300 then raise exception 'TEST: reserva o tarifas incorrectas'; end if;
  if (select count(distinct round_trip_id) from public.reservations where flight_id in ('QA-ROUND-OUT','QA-ROUND-BACK')) <> 1
    or exists(select 1 from public.reservations where flight_id in ('QA-ROUND-OUT','QA-ROUND-BACK') and round_trip_id is null) then raise exception 'TEST: no conservó la asociación de los tramos'; end if;
  -- Si el segundo tramo ya no es pagable, debe revertirse el pago del primero.
  update public.reservations set status='Cancelada' where code=v_booking->'returnReservation'->>'code';
  begin
    perform public.sigv_demo_payment(v_booking->>'code','Tarjeta de prueba');
    raise exception 'TEST: permitió pago de vuelta cancelada';
  exception when raise_exception then
    if sqlerrm <> 'La reserva ya fue procesada' then raise; end if;
  end;
  if exists(select 1 from public.payments p join public.reservations r on r.id=p.reservation_id where r.flight_id='QA-ROUND-OUT')
    or (select status from public.reservations where code=v_booking->>'code') <> 'Pendiente de pago' then raise exception 'TEST: no revirtió pago de ida'; end if;
  update public.reservations set status='Pendiente de pago' where code=v_booking->'returnReservation'->>'code';
  v_payment := public.sigv_demo_payment(v_booking->>'code','Tarjeta de prueba');
  if v_payment->'returnPayment' is null or exists(select 1 from public.reservations where flight_id in ('QA-ROUND-OUT','QA-ROUND-BACK') and status <> 'Confirmada') then raise exception 'TEST: pago incompleto'; end if;
  update public.reservation_passengers set checked_in_at = now() where reservation_id = (select id from public.reservations where code = v_booking->'returnReservation'->>'code');
  begin
    perform public.sigv_cancel_reservation(v_booking->>'code');
    raise exception 'TEST: permitió cancelación con check-in en vuelta';
  exception when raise_exception then
    if sqlerrm <> 'No se puede cancelar una reserva con check-in' then raise; end if;
  end;
  if exists(select 1 from public.reservations where flight_id in ('QA-ROUND-OUT','QA-ROUND-BACK') and status <> 'Confirmada') then raise exception 'TEST: cancelación parcial'; end if;
  update public.reservation_passengers set checked_in_at = null where reservation_id = (select id from public.reservations where code = v_booking->'returnReservation'->>'code');
  perform public.sigv_cancel_reservation(v_booking->>'code');
  if exists(select 1 from public.reservations where flight_id in ('QA-ROUND-OUT','QA-ROUND-BACK') and status <> 'Cancelada')
    or (select seats_first from public.flights where id='QA-ROUND-OUT') <> 4
    or (select seats_economy from public.flights where id='QA-ROUND-BACK') <> 4 then raise exception 'TEST: no canceló ambos tramos y devolvió cupos'; end if;
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.sigv_reserve_round_trip('QA-ROUND-OUT','Economy','QA-ROUND-BACK','Economy',v_people);
    raise exception 'TEST: permitió reserva anónima';
  exception when raise_exception then
    if sqlerrm <> 'Iniciá sesión para reservar' then raise; end if;
  end;
end;
$$;
rollback;
select 'OK: ida y vuelta, cupos, tarifas, reserva, pago, cancelación atómica y autenticación' as resultado;
