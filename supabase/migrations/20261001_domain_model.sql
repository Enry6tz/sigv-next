-- Entidades operativas faltantes del modelo SIGV. Auth gestiona las credenciales.
create table public.aircraft (
  id uuid primary key default gen_random_uuid(),
  model text not null check (length(trim(model)) > 0),
  registration text not null unique check (length(trim(registration)) > 0),
  capacity_economy integer not null check (capacity_economy >= 0),
  capacity_first integer not null check (capacity_first between 0 and 12),
  status text not null default 'Activa' check (status in ('Activa','Mantenimiento','Fuera de servicio')),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.flight_schedules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  origin text not null references public.airports(code),
  destination text not null references public.airports(code),
  aircraft_id uuid not null references public.aircraft(id),
  departure time not null,
  arrival time not null,
  sale_start date not null,
  sale_end date not null,
  status text not null default 'Activa' check (status in ('Activa','Suspendida')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  check (origin <> destination),
  check (sale_end >= sale_start)
);

create table public.schedule_frequencies (
  schedule_id uuid not null references public.flight_schedules(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  primary key (schedule_id, weekday)
);

create table public.schedule_configurations (
  schedule_id uuid not null references public.flight_schedules(id) on delete cascade,
  cabin text not null check (cabin in ('Economy','Primera')),
  capacity integer not null check (capacity >= 0),
  price numeric(12,2) not null check (price >= 0),
  primary key (schedule_id, cabin)
);

alter table public.flights add column schedule_id uuid references public.flight_schedules(id);

create table public.flight_seats (
  id uuid primary key default gen_random_uuid(),
  flight_id text not null references public.flights(id) on delete cascade,
  cabin text not null check (cabin in ('Economy','Primera')),
  code text not null check (code ~ '^[0-9]{1,2}[A-F]$'),
  status text not null default 'Disponible' check (status in ('Disponible','Ocupado','Bloqueado')),
  unique (flight_id, code)
);
create index flight_seats_flight_idx on public.flight_seats(flight_id,cabin,status);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments(id) on delete cascade,
  number text not null unique,
  amount numeric(12,2) not null check (amount >= 0),
  issued_at timestamptz not null default now()
);

create table public.flight_change_logs (
  id uuid primary key default gen_random_uuid(),
  flight_id text not null references public.flights(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  field text not null,
  old_value text,
  new_value text,
  changed_at timestamptz not null default now()
);

create or replace function public.sigv_sync_seats() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.capacity_first > 12 or new.capacity_economy > 582 then
    raise exception 'La capacidad excede la numeración de asientos';
  end if;
  if exists (select 1 from public.flight_seats s where s.flight_id = new.id and s.status = 'Ocupado'
    and (case when s.cabin = 'Primera' then
      ((substring(s.code from '^[0-9]+')::integer - 1) * 6 + ascii(right(s.code,1)) - 64) > new.capacity_first
    else ((substring(s.code from '^[0-9]+')::integer - 3) * 6 + ascii(right(s.code,1)) - 64) > new.capacity_economy end)) then
    raise exception 'La capacidad dejaría fuera asientos ya asignados';
  end if;
  delete from public.flight_seats s where s.flight_id = new.id and s.status <> 'Ocupado'
    and (case when s.cabin = 'Primera' then
      ((substring(s.code from '^[0-9]+')::integer - 1) * 6 + ascii(right(s.code,1)) - 64) > new.capacity_first
    else ((substring(s.code from '^[0-9]+')::integer - 3) * 6 + ascii(right(s.code,1)) - 64) > new.capacity_economy end);
  insert into public.flight_seats(flight_id,cabin,code)
    select new.id, 'Primera', ((n - 1) / 6 + 1)::text || chr(65 + ((n - 1) % 6))
    from generate_series(1,new.capacity_first) n
    on conflict (flight_id,code) do nothing;
  insert into public.flight_seats(flight_id,cabin,code)
    select new.id, 'Economy', ((n - 1) / 6 + 3)::text || chr(65 + ((n - 1) % 6))
    from generate_series(1,new.capacity_economy) n
    on conflict (flight_id,code) do nothing;
  return new;
end;
$$;
create trigger sigv_sync_flight_seats after insert or update of capacity_economy, capacity_first on public.flights
  for each row execute function public.sigv_sync_seats();
update public.flights set capacity_economy = capacity_economy;
update public.flight_seats s set status = 'Ocupado'
  from public.reservation_passengers p
  where p.flight_id = s.flight_id and p.seat = s.code and p.checked_in_at is not null;

create or replace function public.sigv_create_invoice() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.invoices(payment_id,number,amount) values (new.id,new.invoice,new.amount);
  return new;
end;
$$;
create trigger sigv_payment_invoice after insert on public.payments
  for each row execute function public.sigv_create_invoice();
insert into public.invoices(payment_id,number,amount)
  select id,invoice,amount from public.payments on conflict (payment_id) do nothing;

create or replace function public.sigv_log_flight_changes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_field text;
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
begin
  foreach v_field in array array['origin','destination','flight_date','departure','arrival','status','gate',
    'economy','first','capacity_economy','capacity_first','archived_at'] loop
    if v_old ->> v_field is distinct from v_new ->> v_field then
      insert into public.flight_change_logs(flight_id,actor_id,field,old_value,new_value)
      values (new.id,(select auth.uid()),v_field,v_old ->> v_field,v_new ->> v_field);
    end if;
  end loop;
  return new;
end;
$$;
create trigger sigv_flight_audit after update on public.flights
  for each row execute function public.sigv_log_flight_changes();

alter table public.aircraft enable row level security;
alter table public.flight_schedules enable row level security;
alter table public.schedule_frequencies enable row level security;
alter table public.schedule_configurations enable row level security;
alter table public.flight_seats enable row level security;
alter table public.invoices enable row level security;
alter table public.flight_change_logs enable row level security;

revoke all on public.aircraft, public.flight_schedules, public.schedule_frequencies,
  public.schedule_configurations, public.flight_seats, public.invoices, public.flight_change_logs from anon, authenticated;
grant select, insert, update on public.aircraft, public.flight_schedules,
  public.schedule_frequencies, public.schedule_configurations to authenticated;
grant delete on public.schedule_frequencies, public.schedule_configurations to authenticated;
grant select on public.flight_seats, public.invoices, public.flight_change_logs to authenticated;

create policy aircraft_admin_all on public.aircraft for all to authenticated
  using (public.sigv_role() = 'admin') with check (public.sigv_role() = 'admin');
create policy schedules_admin_all on public.flight_schedules for all to authenticated
  using (public.sigv_role() = 'admin') with check (public.sigv_role() = 'admin');
create policy frequencies_admin_all on public.schedule_frequencies for all to authenticated
  using (public.sigv_role() = 'admin') with check (public.sigv_role() = 'admin');
create policy configurations_admin_all on public.schedule_configurations for all to authenticated
  using (public.sigv_role() = 'admin') with check (public.sigv_role() = 'admin');
create policy seats_staff_read on public.flight_seats for select to authenticated
  using (public.sigv_role() in ('admin','mostrador'));
create policy invoices_owner_read on public.invoices for select to authenticated
  using (exists (select 1 from public.payments p join public.reservations r on r.id = p.reservation_id
    where p.id = payment_id and (r.owner_id = (select auth.uid()) or public.sigv_role() = 'admin')));
create policy flight_logs_admin_read on public.flight_change_logs for select to authenticated
  using (public.sigv_role() = 'admin');

revoke all on function public.sigv_sync_seats() from public, anon, authenticated;
revoke all on function public.sigv_create_invoice() from public, anon, authenticated;
revoke all on function public.sigv_log_flight_changes() from public, anon, authenticated;

create or replace function public.sigv_check_in(p_code text, p_document text, p_seat text, p_baggage_kg numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_reservation public.reservations%rowtype;
  v_person public.reservation_passengers%rowtype;
  v_seat public.flight_seats%rowtype;
begin
  if public.sigv_role() not in ('admin', 'mostrador') then raise exception 'Se requiere rol de mostrador'; end if;
  if p_baggage_kg is null or p_baggage_kg < 0 or p_baggage_kg > 40 then raise exception 'Equipaje inválido'; end if;
  select * into v_reservation from public.reservations where code = p_code and status = 'Confirmada';
  if not found then raise exception 'Reserva confirmada no encontrada'; end if;
  if exists (select 1 from public.flights where id = v_reservation.flight_id and (status = 'Cancelado' or archived_at is not null)) then
    raise exception 'El vuelo no está disponible';
  end if;
  select * into v_person from public.reservation_passengers
    where reservation_id = v_reservation.id and document = p_document for update;
  if not found then raise exception 'Documento no encontrado en la reserva'; end if;
  if v_person.checked_in_at is not null then raise exception 'El pasajero ya tiene check-in'; end if;
  select * into v_seat from public.flight_seats
    where flight_id = v_reservation.flight_id and code = upper(p_seat) and cabin = v_reservation.cabin for update;
  if not found or v_seat.status <> 'Disponible' then raise exception 'Asiento no disponible en la cabina'; end if;
  update public.flight_seats set status = 'Ocupado' where id = v_seat.id;
  update public.reservation_passengers set seat = v_seat.code, baggage_kg = p_baggage_kg, checked_in_at = now()
    where id = v_person.id;
  return jsonb_build_object('reservationCode', p_code, 'seat', v_seat.code, 'baggageKg', p_baggage_kg,
    'boardingPass', 'BP-' || upper(substr(replace(v_person.id::text, '-', ''), 1, 10)));
end;
$$;
