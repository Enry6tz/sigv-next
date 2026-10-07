-- Ejecutar en una BD de prueba con las migraciones aplicadas.
-- Todas las pruebas y sus datos se revierten al terminar.
begin;
do $$
declare
  v_admin uuid;
  v_plane uuid;
  v_schedule uuid;
  v_payload jsonb;
  v_reservation jsonb;
  v_result jsonb;
begin
  select user_id into strict v_admin from public.user_roles where role = 'admin' limit 1;
  select id into strict v_plane from public.aircraft where archived_at is null and status = 'Activa'
    and capacity_economy >= 4 and capacity_first >= 1 limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
  v_payload := jsonb_build_object('flightCode','QA-TRANSACTION','aircraftId',v_plane,'origin','EZE','destination','BRC',
    'departure','09:00','arrival','11:00','saleStart','2026-10-20','saleEnd','2026-10-27','weekdays',jsonb_build_array(2),
    'economy',50000,'first',100000,'seatsEconomy',4,'seatsFirst',1,
    'baggageIncluded',false,'seatSelectionEnabled',true,'onlineCheckInEnabled',true,'status','Activa');
  v_result := public.sigv_publish_flight_schedule(v_payload);
  v_schedule := (v_result->>'scheduleId')::uuid;
  if (v_result->>'created')::integer <> 2 then raise exception 'TEST: publicación'; end if;
  v_payload := v_payload || jsonb_build_object('origin','AEP','saleEnd','2026-10-28','weekdays',jsonb_build_array(2,3),'baggageIncluded',true);
  perform public.sigv_manage_flight_schedule(v_schedule,'update',v_payload);
  if (select count(*) from public.flights where schedule_id = v_schedule and archived_at is null) <> 4
    or exists (select 1 from public.flights where schedule_id = v_schedule and (origin <> 'AEP' or not baggage_included))
    then raise exception 'TEST: edición sincroniza ruta, frecuencia, período y notas'; end if;
  -- La reserva tiene dos pasajeros; cambiar cupos no puede liberar sus lugares.
  v_reservation := public.sigv_reserve('QA-TRANSACTION-20261020','Economy',
    '[{"firstName":"Prueba","lastName":"Uno","document":"QA-ONE"},{"firstName":"Prueba","lastName":"Dos","document":"QA-TWO"}]'::jsonb);
  perform public.sigv_manage_flight_schedule(v_schedule,'update',v_payload);
  if (select seats_economy from public.flights where id = 'QA-TRANSACTION-20261020') <> 2 then raise exception 'TEST: preserva cupos reservados'; end if;
  begin
    perform public.sigv_manage_flight_schedule(v_schedule,'delete','{}');
    raise exception 'TEST: permite eliminar con reservas';
  exception when raise_exception then
    if sqlerrm <> 'Cancelá primero las reservas del vuelo' then raise; end if;
  end;
  begin
    perform public.sigv_manage_flight_schedule(v_schedule,'update',v_payload || '{"weekdays":[3]}');
    raise exception 'TEST: permite retirar una fecha con reserva';
  exception when raise_exception then
    if sqlerrm <> 'Cancelá primero las reservas del vuelo' then raise; end if;
  end;
  begin
    perform public.sigv_manage_flight_schedule(v_schedule,'update',v_payload || '{"status":"Suspendida"}');
    raise exception 'TEST: permite suspender con reserva';
  exception when raise_exception then
    if sqlerrm <> 'Cancelá primero las reservas del vuelo' then raise; end if;
  end;
  begin
    perform public.sigv_manage_flight_schedule(v_schedule,'update',v_payload || '{"seatsEconomy":1}');
    raise exception 'TEST: permite reducir cupos reservados';
  exception when raise_exception then
    if sqlerrm <> 'La capacidad no puede ser menor que los asientos reservados' then raise; end if;
  end;
  perform public.sigv_manage_flight_schedule(v_schedule,'fares','{"economy":60000,"first":120000}');
  if (select total_amount from public.reservations where code = v_reservation->>'code') <> 100000
    or exists (select 1 from public.flights where schedule_id = v_schedule and economy <> 60000)
    then raise exception 'TEST: tarifas cambian sin alterar importe de reservas'; end if;
  perform public.sigv_cancel_reservation(v_reservation->>'code');
  perform public.sigv_manage_flight_schedule(v_schedule,'update',v_payload || '{"weekdays":[3]}');
  perform public.sigv_manage_flight_schedule(v_schedule,'delete','{}');
  if exists (select 1 from public.flights where schedule_id = v_schedule and archived_at is null)
    or (select archived_at from public.flight_schedules where id = v_schedule) is null then raise exception 'TEST: baja completa'; end if;
  perform public.sigv_manage_flight_schedule(v_schedule,'restore','{}');
  if (select count(*) from public.flights where schedule_id = v_schedule and archived_at is null) <> 2 then
    raise exception 'TEST: restaurar no reactiva fechas retiradas previamente'; end if;
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.sigv_manage_flight_schedule(v_schedule,'delete','{}');
    raise exception 'TEST: permite operación sin administrador';
  exception when raise_exception then
    if sqlerrm <> 'Se requiere rol administrador' then raise; end if;
  end;
end;
$$;
rollback;
select 'OK: edición, inventario, reservas, tarifas, eliminación, restauración y permisos' as resultado;
