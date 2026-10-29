-- Ejecutar SOLO en un clúster local descartable con las migraciones base y
-- 2026102901 aplicadas. Requiere roles anon/authenticated y auth.uid() compatible
-- con request.jwt.claim.sub. Todo el fixture se revierte al final.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-4000-8000-000000330001','core-admin@example.test','{"first_name":"Core","last_name":"Admin"}'),
 ('00000000-0000-4000-8000-000000330002','core-passenger@example.test','{"first_name":"Core","last_name":"Passenger"}');
update public.user_roles set role='admin' where user_id='00000000-0000-4000-8000-000000330001';
insert into public.flights(id,origin,destination,flight_date,departure,arrival,status,economy,first,
 seats_economy,seats_first,capacity_economy,capacity_first) values
 ('CORE-POLICY','EZE','BRC',current_date+10,'19:00','21:00','Activo',100,200,10,2,10,2),
 ('CORE-REFUND','EZE','BRC',current_date+10,'19:00','21:00','Activo',100,200,10,2,10,2),
 ('CORE-LAST','EZE','BRC',current_date+10,'19:00','21:00','Activo',100,200,10,1,10,1),
 ('CORE-TWO','EZE','BRC',current_date+10,'19:00','21:00','Activo',100,200,10,2,10,2),
 ('CORE-CANCEL','EZE','BRC',current_date+10,'19:00','21:00','Cancelado',100,200,10,2,10,2),
 ('CORE-RESCHEDULED','EZE','BRC',current_date+10,'19:00','21:00','Reprogramado',100,200,10,2,10,2),
 ('CORE-OPERATED','EZE','BRC',current_date+10,'19:00','21:00','Operado',100,200,10,2,10,2),
 ('CORE-SOON','EZE','BRC',current_date+1,'19:00','21:00','Activo',100,200,10,2,10,2),
 ('CORE-DUE','EZE','BRC',current_date-1,'01:00','03:00','Activo',100,200,10,2,10,2);

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000330002',true);
do $$ declare v_code text; v_result jsonb; v_replay jsonb; v_inventory jsonb; begin
  v_result:=public.sigv_reserve('CORE-POLICY','Economy',
    '[{"firstName":"Test","lastName":"One","document":"33000001"},{"firstName":"Test","lastName":"Two","document":"33000002"}]'::jsonb,
    'core-passenger@example.test','+541155555555');
  v_code:=v_result->>'code';
  v_result:=public.sigv_simulated_checkout(v_code,'Tarjeta de prueba','4000000000000002');
  if v_result->>'status'<>'RECHAZADO' then raise exception 'US-035: no rechazó'; end if;
  if exists(select 1 from public.payments p join public.reservations r on r.id=p.reservation_id where r.code=v_code)
    or exists(select 1 from public.reservations where code=v_code and status<>'Pendiente de pago')
    or (select seats_economy from public.flights where id='CORE-POLICY')<>10 then
    raise exception 'US-035: rechazo alteró pago, reserva o inventario'; end if;
  v_result:=public.sigv_simulated_checkout(v_code,'Tarjeta de prueba','4111111111111111');
  v_replay:=public.sigv_simulated_checkout(v_code,'Tarjeta de prueba','4111111111111111');
  if v_result->>'invoice' is null or v_replay->>'invoice' is distinct from v_result->>'invoice'
    or v_replay->>'replayed'<>'true' or (select seats_economy from public.flights where id='CORE-POLICY')<>8 then
    raise exception 'US-034: aprobación/reintento duplicó inventario o factura'; end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000330001',true);
do $$ declare v_code text; v_snapshot jsonb; v_after jsonb; v_inventory jsonb; v_name text; v_error text; begin
  select code into v_code from public.reservations where flight_id='CORE-POLICY';
  v_inventory:=public.sigv_flight_inventory('CORE-POLICY')->0;
  if (v_inventory->>'soldEconomy')::integer<>2 or (v_inventory->>'assignedEconomy')::integer<>0 then
    raise exception 'US-034: venta sin check-in no quedó separada del mapa'; end if;
  perform public.sigv_check_in(v_code,'33000001','3A',0);
  select to_jsonb(p) into v_snapshot from public.reservation_passengers p where document='33000001' and flight_id='CORE-POLICY';
  perform public.sigv_apply_flight_change('CORE-POLICY','{"status":"Retrasado","departure":"20:00","arrival":"22:00"}');
  perform public.sigv_apply_flight_change('CORE-POLICY','{"status":"Retrasado","departure":"20:30","arrival":"22:30"}');
  if (select departure from public.flights where id='CORE-POLICY')<>'20:30'::time then raise exception 'US-033: acumuló demoras'; end if;
  perform public.sigv_apply_flight_change('CORE-POLICY','{"status":"Activo","departure":"18:00","arrival":"20:00"}');
  select to_jsonb(p) into v_after from public.reservation_passengers p where document='33000001' and flight_id='CORE-POLICY';
  if v_snapshot is distinct from v_after or (select status from public.flights where id='CORE-POLICY')<>'Activo' then
    raise exception 'US-033: perdió asiento/check-in o no resolvió adelanto'; end if;
  v_inventory:=public.sigv_flight_inventory('CORE-POLICY')->0;
  if (v_inventory->>'soldEconomy')::integer<>2 or (v_inventory->>'assignedEconomy')::integer<>1 then
    raise exception 'US-034: check-in alteró ventas o no asignó asiento'; end if;
  foreach v_name in array array['CORE-CANCEL','CORE-RESCHEDULED','CORE-OPERATED'] loop
    begin
      perform public.sigv_apply_flight_change(v_name,'{"arrival":"22:00"}');
      raise exception 'US-033: permitió editar un terminal';
    exception when raise_exception then
      if sqlerrm not like 'El vuelo está en estado terminal:%' then raise; end if;
    end;
    begin
      perform public.sigv_reserve(v_name,'Economy','[{"firstName":"Test","lastName":"Terminal","document":"33999999"}]','core-admin@example.test',null);
      raise exception 'US-033: permitió reservar un terminal';
    exception when raise_exception then
      if sqlerrm not like 'El vuelo está en estado terminal:%' and sqlerrm<>'Vuelo no disponible' then raise; end if;
    end;
  end loop;
  begin
    perform public.sigv_apply_flight_change('CORE-SOON',jsonb_build_object('flight_date',current_date+2));
    raise exception 'US-033: admitió cambio de fecha dentro de 48h';
  exception when raise_exception then
    if sqlerrm not like '%48 horas%' then raise; end if;
  end;
  perform public.sigv_close_due_flights();
  if (select status from public.flights where id='CORE-DUE')<>'Operado' then raise exception 'US-033: no cerró vuelo vencido'; end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000330002',true);
do $$ declare v_code text; v_result jsonb; v_other text; begin
  v_result:=public.sigv_reserve('CORE-REFUND','Economy','[{"firstName":"Test","lastName":"Refund","document":"33000003"}]', 'core-passenger@example.test',null);
  v_code:=v_result->>'code'; perform public.sigv_simulated_checkout(v_code,'Transferencia de prueba');
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000330001',true);
  perform public.sigv_refund_reservation(v_code);
  if (select seats_economy from public.flights where id='CORE-REFUND')<>10 then raise exception 'US-034: reembolso no liberó cupo'; end if;
  begin perform public.sigv_refund_reservation(v_code); raise exception 'US-034: permitió doble reembolso';
  exception when raise_exception then if sqlerrm<>'La reserva ya está cancelada' then raise; end if; end;
  if (select seats_economy from public.flights where id='CORE-REFUND')<>10 then raise exception 'US-034: devolvió dos veces'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000330002',true);
  v_result:=public.sigv_reserve('CORE-LAST','Primera','[{"firstName":"Test","lastName":"LastOne","document":"33000004"}]','core-passenger@example.test',null);
  v_code:=v_result->>'code';
  v_result:=public.sigv_reserve('CORE-LAST','Primera','[{"firstName":"Test","lastName":"LastTwo","document":"33000005"}]','core-passenger@example.test',null);
  v_other:=v_result->>'code';
  perform public.sigv_simulated_checkout(v_code,'Transferencia de prueba');
  begin perform public.sigv_simulated_checkout(v_other,'Transferencia de prueba'); raise exception 'US-034: sobreventa';
  exception when raise_exception then if sqlerrm<>'No hay suficientes asientos Primera' then raise; end if; end;
  if (select seats_first from public.flights where id='CORE-LAST')<>0 then raise exception 'US-034: inventario incorrecto'; end if;
  v_result:=public.sigv_reserve('CORE-TWO','Primera','[{"firstName":"Test","lastName":"TwoOne","document":"33000006"}]','core-passenger@example.test',null);
  v_code:=v_result->>'code';
  v_result:=public.sigv_reserve('CORE-TWO','Primera','[{"firstName":"Test","lastName":"TwoTwo","document":"33000007"}]','core-passenger@example.test',null);
  v_other:=v_result->>'code';
  perform public.sigv_simulated_checkout(v_code,'Transferencia de prueba');
  perform public.sigv_simulated_checkout(v_other,'Transferencia de prueba');
  if (select seats_first from public.flights where id='CORE-TWO')<>0 then raise exception 'US-034: no permitió dos ventas válidas'; end if;
end $$;

rollback;
\echo 'PASS US-033/034/035 SQL: terminales, demora, 48h, cierre, check-in, rechazo, idempotencia, reembolso y último cupo secuencial'
-- La carrera concurrente real debe ejecutarse en dos conexiones adicionales; este
-- archivo no afirma que una prueba secuencial demuestre exclusión concurrente.
