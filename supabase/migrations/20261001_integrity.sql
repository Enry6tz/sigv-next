-- Lecturas públicas acotadas, catálogo de aeropuertos y check-in por documento.
alter table public.airports add column archived_at timestamptz;
drop policy airport_read on public.airports;
create policy airport_public_read on public.airports for select to anon using (archived_at is null);
create policy airport_member_read on public.airports for select to authenticated
  using (archived_at is null or public.sigv_role() = 'admin');
grant insert, update on public.airports to authenticated;
create policy airport_admin_insert on public.airports for insert to authenticated
  with check (public.sigv_role() = 'admin');
create policy airport_admin_update on public.airports for update to authenticated
  using (public.sigv_role() = 'admin') with check (public.sigv_role() = 'admin');

drop policy flight_read on public.flights;
create policy flight_public_read on public.flights for select to anon using (archived_at is null);
create policy flight_member_read on public.flights for select to authenticated
  using (archived_at is null or public.sigv_role() = 'admin');

create or replace function public.sigv_flight_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_title text;
begin
  if (new.status, new.flight_date, new.departure, new.arrival)
     is distinct from (old.status, old.flight_date, old.departure, old.arrival) then
    v_title := case
      when new.status = 'Cancelado' then 'Tu vuelo ' || new.id || ' fue cancelado'
      when new.status = 'Retrasado' then 'Tu vuelo ' || new.id || ' registra una demora'
      else 'Tu vuelo ' || new.id || ' cambió de horario o estado'
    end;
    insert into public.notifications(owner_id, flight_id, title)
      select distinct owner_id, new.id, v_title
      from public.reservations where flight_id = new.id and status = 'Confirmada';
    if new.status = 'Cancelado' then
      update public.reservations set status = 'Cancelada'
      where flight_id = new.id and status <> 'Cancelada';
    end if;
  end if;
  return new;
end;
$$;
drop trigger sigv_flight_status_changed on public.flights;
create trigger sigv_flight_changed after update of status, flight_date, departure, arrival on public.flights
  for each row execute function public.sigv_flight_changed();

drop function public.sigv_check_in(text,text,numeric);
create or replace function public.sigv_check_in(p_code text, p_document text, p_seat text, p_baggage_kg numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_reservation public.reservations%rowtype;
  v_person public.reservation_passengers%rowtype;
  v_row integer;
begin
  if public.sigv_role() not in ('admin', 'mostrador') then raise exception 'Se requiere rol de mostrador'; end if;
  if p_seat !~ '^[0-9]{1,2}[A-F]$' or p_baggage_kg < 0 or p_baggage_kg > 40 then
    raise exception 'Asiento o equipaje inválido';
  end if;
  v_row := substring(p_seat from '^[0-9]+')::integer;
  select * into v_reservation from public.reservations where code = p_code and status = 'Confirmada';
  if not found then raise exception 'Reserva confirmada no encontrada'; end if;
  if exists (select 1 from public.flights where id = v_reservation.flight_id and status = 'Cancelado') then
    raise exception 'El vuelo fue cancelado';
  end if;
  if (v_reservation.cabin = 'Primera' and v_row > 2) or
     (v_reservation.cabin = 'Economy' and v_row <= 2) then
    raise exception 'El asiento no pertenece a la cabina reservada';
  end if;
  select * into v_person from public.reservation_passengers
    where reservation_id = v_reservation.id and document = p_document for update;
  if not found then raise exception 'Documento no encontrado en la reserva'; end if;
  if v_person.checked_in_at is not null then raise exception 'El pasajero ya tiene check-in'; end if;
  update public.reservation_passengers set seat = p_seat, baggage_kg = p_baggage_kg, checked_in_at = now()
    where id = v_person.id;
  return jsonb_build_object('reservationCode', p_code, 'seat', p_seat, 'baggageKg', p_baggage_kg,
    'boardingPass', 'BP-' || upper(substr(replace(v_person.id::text, '-', ''), 1, 10)));
end;
$$;
revoke all on function public.sigv_check_in(text,text,text,numeric) from public, anon, authenticated;
grant execute on function public.sigv_check_in(text,text,text,numeric) to authenticated;
