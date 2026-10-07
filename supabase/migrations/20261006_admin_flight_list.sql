-- Una fila por programación. Conserva los vuelos históricos y sus reservas.
begin;

-- Los vuelos antiguos no registraban aeronave: no inventar una asignación.
alter table public.flight_schedules alter column aircraft_id drop not null;
drop trigger if exists sigv_validate_schedule on public.flight_schedules;
do $$
declare
  v_flight public.flights%rowtype;
  v_id uuid;
  v_code text;
begin
  for v_flight in select * from public.flights where schedule_id is null order by id loop
    v_code := v_flight.id;
    if exists (select 1 from public.flight_schedules where code = v_code) then
      v_code := left(v_flight.id, 11) || '-' || left(md5(v_flight.id), 8);
    end if;
    insert into public.flight_schedules(code,origin,destination,aircraft_id,departure,arrival,sale_start,sale_end,
      status,archived_at,baggage_included,seat_selection_enabled,online_check_in_enabled)
    values (v_code,v_flight.origin,v_flight.destination,null,v_flight.departure,v_flight.arrival,
      v_flight.flight_date,v_flight.flight_date,case when v_flight.status = 'Cancelado' then 'Suspendida' else 'Activa' end,
      v_flight.archived_at,v_flight.baggage_included,v_flight.seat_selection_enabled,v_flight.online_check_in_enabled)
    returning id into v_id;
    insert into public.schedule_frequencies(schedule_id,weekday) values (v_id,extract(dow from v_flight.flight_date)::integer);
    insert into public.schedule_configurations(schedule_id,cabin,capacity,price) values
      (v_id,'Economy',v_flight.capacity_economy,v_flight.economy),(v_id,'Primera',v_flight.capacity_first,v_flight.first);
    update public.flights set schedule_id = v_id where id = v_flight.id;
  end loop;
end;
$$;
create trigger sigv_validate_schedule before insert or update of origin,destination,aircraft_id on public.flight_schedules
  for each row execute function public.sigv_validate_schedule();

create or replace function public.sigv_manage_flight_schedule(p_schedule_id uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_schedule public.flight_schedules%rowtype;
  v_aircraft public.aircraft%rowtype;
  v_from date;
  v_to date;
  v_days integer[];
  v_status text;
  v_economy integer;
  v_first integer;
  v_economy_price numeric(12,2);
  v_first_price numeric(12,2);
  v_time timestamptz := clock_timestamp();
  v_generated jsonb;
begin
  if public.sigv_role() is distinct from 'admin' then raise exception 'Se requiere rol administrador'; end if;
  select * into v_schedule from public.flight_schedules where id = p_schedule_id for update;
  if not found then raise exception 'Programación no disponible'; end if;
  -- Mismo bloqueo que reserva: evita eliminar o reducir cupos durante una compra.
  perform 1 from public.flights where schedule_id = p_schedule_id order by id for update;
  if p_action = 'restore' then
    if v_schedule.archived_at is null then raise exception 'Programación no disponible'; end if;
    update public.flights set archived_at = null
      where schedule_id = p_schedule_id and archived_at = v_schedule.archived_at
        and flight_date between v_schedule.sale_start and v_schedule.sale_end
        and exists (select 1 from public.schedule_frequencies sf where sf.schedule_id = p_schedule_id
          and sf.weekday = extract(dow from public.flights.flight_date)::integer);
    update public.flight_schedules set archived_at = null where id = p_schedule_id;
    return jsonb_build_object('scheduleId',p_schedule_id);
  end if;
  if v_schedule.archived_at is not null then raise exception 'Programación no disponible'; end if;
  if p_action = 'delete' then
    if exists (select 1 from public.reservations r join public.flights f on f.id = r.flight_id
      where f.schedule_id = p_schedule_id and r.status <> 'Cancelada') then
      raise exception 'Cancelá primero las reservas del vuelo';
    end if;
    update public.flights set archived_at = v_time where schedule_id = p_schedule_id and archived_at is null;
    update public.flight_schedules set archived_at = v_time where id = p_schedule_id;
    return jsonb_build_object('scheduleId',p_schedule_id);
  end if;
  if p_action not in ('update','fares') or p_action is null then raise exception 'Operación inválida'; end if;
  v_economy_price := (p_payload->>'economy')::numeric;
  v_first_price := (p_payload->>'first')::numeric;
  if v_economy_price is null or v_first_price is null or v_economy_price < 0 or v_first_price < 0 then
    raise exception 'Tarifas inválidas' using errcode = '22023';
  end if;
  if p_action = 'fares' then
    insert into public.schedule_configurations(schedule_id,cabin,capacity,price) values
      (p_schedule_id,'Economy',0,v_economy_price),(p_schedule_id,'Primera',0,v_first_price)
      on conflict (schedule_id,cabin) do update set price = excluded.price;
    update public.flights set economy = v_economy_price, first = v_first_price
      where schedule_id = p_schedule_id and archived_at is null;
    return jsonb_build_object('scheduleId',p_schedule_id);
  end if;

  v_from := (p_payload->>'saleStart')::date;
  v_to := (p_payload->>'saleEnd')::date;
  v_status := p_payload->>'status';
  v_economy := (p_payload->>'seatsEconomy')::integer;
  v_first := (p_payload->>'seatsFirst')::integer;
  if v_from is null or v_to is null or v_to < v_from or v_to - v_from > 366 then raise exception 'El rango debe tener hasta 366 días'; end if;
  if v_status is null or v_status not in ('Activa','Suspendida') then raise exception 'Estado inválido' using errcode = '22023'; end if;
  if (p_payload->>'departure')::time is null or (p_payload->>'arrival')::time is null
    or (p_payload->>'departure')::time = (p_payload->>'arrival')::time then
    raise exception 'Los horarios de salida y llegada deben ser diferentes';
  end if;
  if jsonb_typeof(p_payload->'weekdays') is distinct from 'array' then raise exception 'Seleccioná al menos un día de operación'; end if;
  select array_agg(value::integer) into v_days from jsonb_array_elements_text(p_payload->'weekdays') days(value);
  if coalesce(cardinality(v_days),0) = 0 or exists (select 1 from unnest(v_days) d where d is null or d not between 0 and 6)
    or cardinality(v_days) <> (select count(distinct d) from unnest(v_days) d) then raise exception 'Seleccioná al menos un día de operación'; end if;
  if not exists (select 1 from generate_series(v_from::timestamp,v_to::timestamp,interval '1 day') d
    where extract(dow from d)::integer = any(v_days)) then raise exception 'El período elegido no incluye los días de operación seleccionados'; end if;
  select * into v_aircraft from public.aircraft where id = (p_payload->>'aircraftId')::uuid
    and archived_at is null and status = 'Activa' for share;
  if not found then raise exception 'Avión no disponible'; end if;
  if v_economy is null or v_first is null or v_economy < 0 or v_first < 0 or v_economy + v_first = 0 then
    raise exception 'Asigná al menos un asiento para publicar el vuelo'; end if;
  if v_economy > v_aircraft.capacity_economy or v_first > v_aircraft.capacity_first or v_economy > 582 or v_first > 12 then
    raise exception 'La configuración excede la capacidad del avión'; end if;
  if exists (select 1 from public.flights where schedule_id = p_schedule_id
    and (capacity_economy - seats_economy > v_economy or capacity_first - seats_first > v_first)) then
    raise exception 'La capacidad no puede ser menor que los asientos reservados'; end if;
  -- No cancelar silenciosamente reservas al cambiar frecuencia, período o estado.
  if exists (select 1 from public.reservations r join public.flights f on f.id = r.flight_id
    where f.schedule_id = p_schedule_id and r.status <> 'Cancelada' and
      (v_status = 'Suspendida' or f.flight_date not between v_from and v_to or not (extract(dow from f.flight_date)::integer = any(v_days)))) then
    raise exception 'Cancelá primero las reservas del vuelo';
  end if;
  update public.flight_schedules set origin = upper(trim(p_payload->>'origin')), destination = upper(trim(p_payload->>'destination')),
    aircraft_id = v_aircraft.id, departure = (p_payload->>'departure')::time, arrival = (p_payload->>'arrival')::time,
    sale_start = v_from, sale_end = v_to, status = 'Activa', baggage_included = (p_payload->>'baggageIncluded')::boolean,
    seat_selection_enabled = (p_payload->>'seatSelectionEnabled')::boolean,
    online_check_in_enabled = (p_payload->>'onlineCheckInEnabled')::boolean where id = p_schedule_id;
  delete from public.schedule_frequencies where schedule_id = p_schedule_id;
  insert into public.schedule_frequencies(schedule_id,weekday) select p_schedule_id,d from unnest(v_days) d;
  insert into public.schedule_configurations(schedule_id,cabin,capacity,price) values
    (p_schedule_id,'Economy',v_economy,v_economy_price),(p_schedule_id,'Primera',v_first,v_first_price)
    on conflict (schedule_id,cabin) do update set capacity = excluded.capacity, price = excluded.price;
  update public.flights set archived_at = coalesce(archived_at,v_time) where schedule_id = p_schedule_id
    and (flight_date not between v_from and v_to or not (extract(dow from flight_date)::integer = any(v_days)));
  update public.flights set origin = upper(trim(p_payload->>'origin')), destination = upper(trim(p_payload->>'destination')),
    departure = (p_payload->>'departure')::time, arrival = (p_payload->>'arrival')::time,
    economy = v_economy_price, first = v_first_price,
    seats_economy = seats_economy + v_economy - capacity_economy, seats_first = seats_first + v_first - capacity_first,
    capacity_economy = v_economy, capacity_first = v_first, archived_at = null,
    status = case when v_status = 'Suspendida' then 'Cancelado' when v_schedule.status = 'Suspendida' then 'Activo' else status end,
    baggage_included = (p_payload->>'baggageIncluded')::boolean,
    seat_selection_enabled = (p_payload->>'seatSelectionEnabled')::boolean,
    online_check_in_enabled = (p_payload->>'onlineCheckInEnabled')::boolean
    where schedule_id = p_schedule_id and flight_date between v_from and v_to
      and extract(dow from flight_date)::integer = any(v_days);
  -- No duplicar la instancia migrada, cuyo identificador original debe conservarse.
  for v_from in select d::date from generate_series(v_from::timestamp,v_to::timestamp,interval '1 day') d
    where extract(dow from d)::integer = any(v_days)
      and not exists (select 1 from public.flights f where f.schedule_id = p_schedule_id and f.flight_date = d::date) loop
    v_generated := public.sigv_generate_schedule(p_schedule_id,v_from,v_from);
    if (v_generated->>'created')::integer <> 1 then raise exception 'flights_pkey' using errcode = '23505'; end if;
  end loop;
  update public.flight_schedules set status = v_status where id = p_schedule_id;
  if v_status = 'Suspendida' then update public.flights set status = 'Cancelado' where schedule_id = p_schedule_id and archived_at is null; end if;
  return jsonb_build_object('scheduleId',p_schedule_id);
end;
$$;
revoke all on function public.sigv_manage_flight_schedule(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.sigv_manage_flight_schedule(uuid,text,jsonb) to authenticated;
commit;
