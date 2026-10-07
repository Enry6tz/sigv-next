-- Alta completa desde Vuelos. La programación, sus clases y sus vuelos se
-- publican en una única transacción; cualquier error revierte toda el alta.
alter table public.flight_schedules
  add column baggage_included boolean not null default false,
  add column seat_selection_enabled boolean not null default true,
  add column online_check_in_enabled boolean not null default true;
alter table public.flights
  add column baggage_included boolean not null default false,
  add column seat_selection_enabled boolean not null default true,
  add column online_check_in_enabled boolean not null default true;

create or replace function public.sigv_apply_fare_notes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.schedule_id is not null then
    select baggage_included, seat_selection_enabled, online_check_in_enabled
      into new.baggage_included, new.seat_selection_enabled, new.online_check_in_enabled
      from public.flight_schedules where id = new.schedule_id;
  end if;
  return new;
end;
$$;
create trigger sigv_apply_fare_notes before insert on public.flights
  for each row execute function public.sigv_apply_fare_notes();
revoke all on function public.sigv_apply_fare_notes() from public, anon, authenticated;

create or replace function public.sigv_publish_flight_schedule(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_aircraft public.aircraft%rowtype;
  v_schedule_id uuid;
  v_code text := upper(trim(p_payload->>'flightCode'));
  v_from date := (p_payload->>'saleStart')::date;
  v_to date := (p_payload->>'saleEnd')::date;
  v_departure time := (p_payload->>'departure')::time;
  v_arrival time := (p_payload->>'arrival')::time;
  v_economy integer := (p_payload->>'seatsEconomy')::integer;
  v_first integer := (p_payload->>'seatsFirst')::integer;
  v_days integer[];
  v_expected integer;
  v_generated jsonb;
begin
  if public.sigv_role() is distinct from 'admin' then raise exception 'Se requiere rol administrador'; end if;
  if v_code is null or v_code !~ '^[A-Z0-9][A-Z0-9-]{1,19}$' then
    raise exception 'Código inválido' using errcode = '22023';
  end if;
  if v_from is null or v_to is null or v_to < v_from or v_to - v_from > 366 then
    raise exception 'El rango debe tener hasta 366 días';
  end if;
  if v_departure is null or v_arrival is null or v_departure = v_arrival then
    raise exception 'Los horarios de salida y llegada deben ser diferentes';
  end if;
  if jsonb_typeof(p_payload->'weekdays') is distinct from 'array' then
    raise exception 'Seleccioná al menos un día de operación';
  end if;
  select array_agg(value::integer) into v_days
    from jsonb_array_elements_text(p_payload->'weekdays') as days(value);
  if coalesce(cardinality(v_days),0) = 0
    or exists (select 1 from unnest(v_days) d where d is null or d not between 0 and 6)
    or cardinality(v_days) <> (select count(distinct d) from unnest(v_days) d) then
    raise exception 'Seleccioná al menos un día de operación';
  end if;
  select count(*) into v_expected
    from generate_series(v_from::timestamp,v_to::timestamp,interval '1 day') d
    where extract(dow from d)::integer = any(v_days);
  if v_expected = 0 then raise exception 'El período elegido no incluye los días de operación seleccionados'; end if;
  select * into v_aircraft from public.aircraft
    where id = (p_payload->>'aircraftId')::uuid and status = 'Activa' and archived_at is null for share;
  if not found then raise exception 'Avión no disponible'; end if;
  if v_economy is null or v_first is null or v_economy < 0 or v_first < 0 or v_economy + v_first = 0 then
    raise exception 'Asigná al menos un asiento para publicar el vuelo';
  end if;
  if v_economy > v_aircraft.capacity_economy or v_first > v_aircraft.capacity_first
    or v_economy > 582 or v_first > 12 then
    raise exception 'La configuración excede la capacidad del avión';
  end if;
  insert into public.flight_schedules(code,origin,destination,aircraft_id,departure,arrival,sale_start,sale_end,
    baggage_included,seat_selection_enabled,online_check_in_enabled)
  values (v_code,upper(trim(p_payload->>'origin')),upper(trim(p_payload->>'destination')),v_aircraft.id,
    v_departure,v_arrival,v_from,v_to,(p_payload->>'baggageIncluded')::boolean,
    (p_payload->>'seatSelectionEnabled')::boolean,(p_payload->>'onlineCheckInEnabled')::boolean)
  returning id into v_schedule_id;
  insert into public.schedule_frequencies(schedule_id,weekday)
    select v_schedule_id,d from unnest(v_days) d;
  insert into public.schedule_configurations(schedule_id,cabin,capacity,price) values
    (v_schedule_id,'Economy',v_economy,(p_payload->>'economy')::numeric),
    (v_schedule_id,'Primera',v_first,(p_payload->>'first')::numeric);
  v_generated := public.sigv_generate_schedule(v_schedule_id,v_from,v_to);
  if (v_generated->>'created')::integer <> v_expected then
    raise exception 'flights_pkey' using errcode = '23505';
  end if;
  return v_generated || jsonb_build_object('code',v_code);
end;
$$;
revoke all on function public.sigv_publish_flight_schedule(jsonb) from public, anon, authenticated;
grant execute on function public.sigv_publish_flight_schedule(jsonb) to authenticated;
