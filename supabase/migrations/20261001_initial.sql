-- SIGV: primera base operativa para Supabase Data API.
-- Ejecutar una sola vez en el SQL Editor del proyecto SIGV.
-- Todas las tablas expuestas tienen RLS y permisos explícitos.

create table public.airports (
  code text primary key check (code ~ '^[A-Z]{3}$'),
  city text not null,
  name text not null
);

create table public.flights (
  id text primary key,
  origin text not null references public.airports(code),
  destination text not null references public.airports(code),
  flight_date date not null,
  departure time not null,
  arrival time not null,
  status text not null default 'Activo' check (status in ('Activo', 'Retrasado', 'Cancelado')),
  economy numeric(12,2) not null check (economy >= 0),
  first numeric(12,2) not null check (first >= 0),
  seats_economy integer not null check (seats_economy >= 0),
  seats_first integer not null check (seats_first >= 0),
  capacity_economy integer not null check (capacity_economy >= seats_economy),
  capacity_first integer not null check (capacity_first >= seats_first),
  gate text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  constraint different_airports check (origin <> destination)
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  document text,
  phone text,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'pasajero' check (role in ('pasajero', 'admin', 'mostrador'))
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('SIGV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  owner_id uuid not null references auth.users(id),
  flight_id text not null references public.flights(id),
  cabin text not null check (cabin in ('Economy', 'Primera')),
  passenger_count integer not null check (passenger_count between 1 and 9),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  status text not null default 'Pendiente de pago' check (status in ('Pendiente de pago', 'Confirmada', 'Cancelada')),
  created_at timestamptz not null default now()
);

create table public.reservation_passengers (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  flight_id text not null references public.flights(id),
  first_name text not null,
  last_name text not null,
  document text not null,
  seat text,
  baggage_kg numeric(5,1),
  checked_in_at timestamptz
);

create unique index one_seat_per_flight on public.reservation_passengers(flight_id, seat) where seat is not null;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.reservations(id),
  method text not null,
  amount numeric(12,2) not null,
  status text not null default 'Aprobado (simulado)',
  invoice text not null unique default ('SIM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  flight_id text references public.flights(id),
  title text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.sigv_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id, email, name)
  values (new.id, coalesce(new.email, ''), trim(concat_ws(' ', new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data ->> 'last_name')));
  insert into public.user_roles(user_id, role) values (new.id, 'pasajero');
  return new;
end;
$$;
create trigger sigv_auth_user_created after insert on auth.users for each row execute function public.sigv_new_user();

create or replace function public.sigv_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.user_roles where user_id = (select auth.uid())
$$;

create or replace function public.sigv_reserve(p_flight_id text, p_cabin text, p_passengers jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_flight public.flights%rowtype;
  v_reservation public.reservations%rowtype;
  v_count integer;
  v_person jsonb;
  v_price numeric(12,2);
begin
  if (select auth.uid()) is null then raise exception 'Iniciá sesión para reservar'; end if;
  if jsonb_typeof(p_passengers) is distinct from 'array' then raise exception 'Pasajeros inválidos'; end if;
  v_count := jsonb_array_length(p_passengers);
  if v_count not between 1 and 9 then raise exception 'La compra admite entre 1 y 9 pasajeros'; end if;
  if p_cabin not in ('Economy', 'Primera') then raise exception 'Cabina inválida'; end if;
  select * into v_flight from public.flights where id = p_flight_id for update;
  if not found or v_flight.status = 'Cancelado' or v_flight.flight_date < current_date then
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
    if length(trim(coalesce(v_person ->> 'firstName', ''))) = 0
      or length(trim(coalesce(v_person ->> 'lastName', ''))) = 0
      or length(trim(coalesce(v_person ->> 'document', ''))) = 0 then
      raise exception 'Completá nombre, apellido y documento de cada pasajero';
    end if;
  end loop;
  insert into public.reservations(owner_id, flight_id, cabin, passenger_count, total_amount)
  values ((select auth.uid()), p_flight_id, p_cabin, v_count, v_price * v_count)
  returning * into v_reservation;
  for v_person in select value from jsonb_array_elements(p_passengers) loop
    insert into public.reservation_passengers(reservation_id, flight_id, first_name, last_name, document)
    values (v_reservation.id, p_flight_id, trim(v_person ->> 'firstName'), trim(v_person ->> 'lastName'), trim(v_person ->> 'document'));
  end loop;
  return jsonb_build_object('code', v_reservation.code, 'flightId', p_flight_id, 'cabin', p_cabin,
    'seats', v_count, 'status', v_reservation.status, 'totalAmount', v_reservation.total_amount);
end;
$$;

create or replace function public.sigv_demo_payment(p_code text, p_method text) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
  update public.reservations set status = 'Confirmada' where id = v_reservation.id;
  return jsonb_build_object('reservationCode', p_code, 'status', v_payment.status, 'invoice', v_payment.invoice);
end;
$$;

create or replace function public.sigv_check_in(p_code text, p_seat text, p_baggage_kg numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_reservation public.reservations%rowtype;
  v_person public.reservation_passengers%rowtype;
begin
  if public.sigv_role() not in ('admin', 'mostrador') then raise exception 'Se requiere rol de mostrador'; end if;
  if p_seat !~ '^[0-9]{1,2}[A-F]$' or p_baggage_kg < 0 or p_baggage_kg > 40 then
    raise exception 'Asiento o equipaje inválido';
  end if;
  select * into v_reservation from public.reservations where code = p_code and status = 'Confirmada';
  if not found then raise exception 'Reserva confirmada no encontrada'; end if;
  select * into v_person from public.reservation_passengers
    where reservation_id = v_reservation.id and checked_in_at is null order by id limit 1 for update;
  if not found then raise exception 'Todos los pasajeros ya tienen check-in'; end if;
  update public.reservation_passengers set seat = p_seat, baggage_kg = p_baggage_kg, checked_in_at = now()
    where id = v_person.id;
  return jsonb_build_object('reservationCode', p_code, 'seat', p_seat, 'baggageKg', p_baggage_kg,
    'boardingPass', 'BP-' || upper(substr(replace(v_person.id::text, '-', ''), 1, 10)));
end;
$$;

alter table public.airports enable row level security;
alter table public.flights enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_passengers enable row level security;
alter table public.payments enable row level security;
alter table public.notifications enable row level security;

revoke all on public.airports, public.flights, public.profiles, public.user_roles,
  public.reservations, public.reservation_passengers, public.payments, public.notifications from anon, authenticated;
grant select on public.airports, public.flights to anon, authenticated;
grant insert, update, delete on public.flights to authenticated;
grant select on public.profiles, public.reservations, public.reservation_passengers,
  public.payments, public.notifications to authenticated;
grant update(name, document, phone) on public.profiles to authenticated;

create policy airport_read on public.airports for select to anon, authenticated using (true);
create policy flight_read on public.flights for select to anon, authenticated using (true);
create policy flight_insert on public.flights for insert to authenticated with check (public.sigv_role() = 'admin');
create policy flight_update on public.flights for update to authenticated
  using (public.sigv_role() = 'admin') with check (public.sigv_role() = 'admin');
create policy flight_delete on public.flights for delete to authenticated using (public.sigv_role() = 'admin');
create policy profile_read on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or public.sigv_role() = 'admin');
create policy profile_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy reservation_read on public.reservations for select to authenticated
  using (owner_id = (select auth.uid()) or public.sigv_role() in ('admin', 'mostrador'));
create policy passenger_read on public.reservation_passengers for select to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_id
    and (r.owner_id = (select auth.uid()) or public.sigv_role() in ('admin', 'mostrador'))));
create policy payment_read on public.payments for select to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_id
    and (r.owner_id = (select auth.uid()) or public.sigv_role() = 'admin')));
create policy notification_read on public.notifications for select to authenticated
  using (owner_id = (select auth.uid()));

revoke all on function public.sigv_new_user() from public, anon, authenticated;
revoke all on function public.sigv_role() from public, anon, authenticated;
revoke all on function public.sigv_reserve(text,text,jsonb) from public, anon, authenticated;
revoke all on function public.sigv_demo_payment(text,text) from public, anon, authenticated;
revoke all on function public.sigv_check_in(text,text,numeric) from public, anon, authenticated;
grant execute on function public.sigv_role() to authenticated;
grant execute on function public.sigv_reserve(text,text,jsonb) to authenticated;
grant execute on function public.sigv_demo_payment(text,text) to authenticated;
grant execute on function public.sigv_check_in(text,text,numeric) to authenticated;

insert into public.airports(code, city, name) values
  ('EZE','Buenos Aires','Ministro Pistarini'), ('AEP','Buenos Aires','Aeroparque'),
  ('COR','Córdoba','Ingeniero Taravella'), ('MDZ','Mendoza','El Plumerillo'),
  ('BRC','Bariloche','Teniente Luis Candelaria'), ('SCL','Santiago','Arturo Merino Benítez'),
  ('USH','Ushuaia','Malvinas Argentinas');

insert into public.flights(id, origin, destination, flight_date, departure, arrival, economy, first,
  seats_economy, seats_first, capacity_economy, capacity_first, status, is_demo) values
  ('AR-1420','EZE','BRC',current_date + 7,'07:20','09:45',128500,284000,84,12,84,12,'Activo',true),
  ('AR-2231','AEP','MDZ',current_date + 7,'11:15','13:05',98400,209000,65,8,65,8,'Activo',true),
  ('AR-0885','EZE','SCL',current_date + 8,'15:40','17:50',166900,342000,47,6,47,6,'Retrasado',true),
  ('AR-3310','COR','EZE',current_date + 9,'20:10','21:45',88900,196000,91,10,91,10,'Activo',true),
  ('AR-0441','AEP','USH',current_date + 10,'06:30','10:15',195000,401000,39,5,39,5,'Activo',true);
