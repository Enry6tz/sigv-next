-- Programaciones recurrentes e instancias de vuelo.
create or replace function public.sigv_validate_flight_airports() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.airports where code in (new.origin,new.destination) and archived_at is not null) then
    raise exception 'La ruta incluye un aeropuerto archivado';
  end if;
  return new;
end;
$$;
create trigger sigv_validate_flight_airports before insert or update of origin,destination on public.flights
  for each row execute function public.sigv_validate_flight_airports();

create or replace function public.sigv_validate_schedule() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.airports where code in (new.origin,new.destination) and archived_at is not null) then
    raise exception 'La ruta incluye un aeropuerto archivado';
  end if;
  if not exists (select 1 from public.aircraft where id = new.aircraft_id and archived_at is null and status = 'Activa') then
    raise exception 'El avión no está activo';
  end if;
  return new;
end;
$$;
create trigger sigv_validate_schedule before insert or update of origin,destination,aircraft_id on public.flight_schedules
  for each row execute function public.sigv_validate_schedule();

create or replace function public.sigv_generate_schedule(p_schedule_id uuid, p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_schedule public.flight_schedules%rowtype;
  v_aircraft public.aircraft%rowtype;
  v_economy public.schedule_configurations%rowtype;
  v_first public.schedule_configurations%rowtype;
  v_day date;
  v_added integer := 0;
begin
  if public.sigv_role() <> 'admin' then raise exception 'Se requiere rol administrador'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'El rango debe tener hasta 366 días';
  end if;
  select * into v_schedule from public.flight_schedules where id = p_schedule_id;
  if not found or v_schedule.status <> 'Activa' or v_schedule.archived_at is not null then
    raise exception 'Programación no disponible';
  end if;
  select * into v_aircraft from public.aircraft where id = v_schedule.aircraft_id;
  if v_aircraft.status <> 'Activa' or v_aircraft.archived_at is not null then raise exception 'Avión no disponible'; end if;
  select * into v_economy from public.schedule_configurations where schedule_id = p_schedule_id and cabin = 'Economy';
  if not found then raise exception 'Falta configurar Economy'; end if;
  select * into v_first from public.schedule_configurations where schedule_id = p_schedule_id and cabin = 'Primera';
  if not found then raise exception 'Falta configurar Primera'; end if;
  if v_economy.capacity > v_aircraft.capacity_economy or v_first.capacity > v_aircraft.capacity_first then
    raise exception 'La configuración excede la capacidad del avión';
  end if;
  for v_day in select d::date from generate_series(greatest(p_from,v_schedule.sale_start),
    least(p_to,v_schedule.sale_end),interval '1 day') d loop
    if exists (select 1 from public.schedule_frequencies where schedule_id = p_schedule_id
      and weekday = extract(dow from v_day)::integer) then
      insert into public.flights(id,origin,destination,flight_date,departure,arrival,
        economy,first,seats_economy,seats_first,capacity_economy,capacity_first,schedule_id)
      values (v_schedule.code || '-' || to_char(v_day,'YYYYMMDD'), v_schedule.origin,v_schedule.destination,
        v_day,v_schedule.departure,v_schedule.arrival,v_economy.price,v_first.price,
        v_economy.capacity,v_first.capacity,v_economy.capacity,v_first.capacity,p_schedule_id)
      on conflict (id) do nothing;
      if found then v_added := v_added + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('scheduleId',p_schedule_id,'created',v_added);
end;
$$;
revoke all on function public.sigv_generate_schedule(uuid,date,date) from public, anon, authenticated;
grant execute on function public.sigv_generate_schedule(uuid,date,date) to authenticated;
revoke all on function public.sigv_validate_flight_airports() from public, anon, authenticated;
revoke all on function public.sigv_validate_schedule() from public, anon, authenticated;
