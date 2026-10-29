-- US-025 / US-026. Cola transaccional independiente de los avisos internos.
alter table public.flights add column if not exists change_reason text;
alter table public.flights add constraint flights_change_reason_length check (length(change_reason) <= 2000);

create table public.flight_mail_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  reservation_id uuid not null references public.reservations(id),
  reservation_code text not null,
  flight_id text not null references public.flights(id),
  recipient text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'retry', 'sent')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claim_token uuid,
  claimed_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique(event_id, reservation_id)
);
create index flight_mail_pending on public.flight_mail_outbox(next_attempt_at) where status <> 'sent';
create table public.flight_mail_attempts (
  id bigint generated always as identity primary key,
  outbox_id uuid not null references public.flight_mail_outbox(id),
  attempt integer not null,
  result text not null check (result in ('claimed', 'sent', 'retry', 'lease_expired')),
  detail text,
  created_at timestamptz not null default now()
);
alter table public.flight_mail_outbox enable row level security;
alter table public.flight_mail_attempts enable row level security;
revoke all on public.flight_mail_outbox, public.flight_mail_attempts from public, anon, authenticated;
grant select on public.flight_mail_outbox, public.flight_mail_attempts to authenticated;
create policy admin_flight_mail_read on public.flight_mail_outbox for select to authenticated
  using ((select public.sigv_role()) = 'admin');
create policy admin_flight_mail_attempt_read on public.flight_mail_attempts for select to authenticated
  using ((select public.sigv_role()) = 'admin');

create or replace function public.sigv_queue_flight_change_email() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_event uuid := gen_random_uuid();
  v_kind text;
begin
  if new.status = 'Cancelado' and old.status is distinct from 'Cancelado' then
    v_kind := 'cancelled';
  elsif (new.flight_date, new.departure, new.arrival) is distinct from (old.flight_date, old.departure, old.arrival) then
    v_kind := 'rescheduled';
  else
    return new;
  end if;

  -- BEFORE UPDATE captura las confirmadas antes del trigger de cancelación.
  -- Si otra guarda rechaza la operación, el evento se revierte en la misma transacción.
  insert into public.flight_mail_outbox(event_id, reservation_id, reservation_code, flight_id, recipient, payload)
  select v_event, r.id, r.code, new.id, coalesce(nullif(r.contact_email, ''), nullif(p.email, '')),
    jsonb_build_object(
      'kind', v_kind, 'recipient', coalesce(nullif(r.contact_email, ''), nullif(p.email, '')),
      'reservationCode', r.code,
      'flightCode', case when new.schedule_id is null then new.id else regexp_replace(new.id, '-[0-9]{8}$', '') end,
      'origin', new.origin, 'destination', new.destination, 'reason', new.change_reason,
      'passengers', coalesce((select jsonb_agg(rp.first_name || ' ' || rp.last_name order by rp.id)
          from public.reservation_passengers rp where rp.reservation_id = r.id), '[]'::jsonb),
      'previous', jsonb_build_object('date', old.flight_date, 'departure', old.departure, 'arrival', old.arrival),
      'current', jsonb_build_object('date', new.flight_date, 'departure', new.departure, 'arrival', new.arrival))
  from public.reservations r left join public.profiles p on p.user_id = r.owner_id
  where r.flight_id = new.id and r.status = 'Confirmada'
    and coalesce(nullif(r.contact_email, ''), nullif(p.email, '')) is not null
  on conflict (event_id, reservation_id) do nothing;
  return new;
end;
$$;
revoke all on function public.sigv_queue_flight_change_email() from public, anon, authenticated;
create trigger sigv_00_queue_flight_change_email before update of status, flight_date, departure, arrival on public.flights
  for each row execute function public.sigv_queue_flight_change_email();

create or replace function public.sigv_claim_flight_mail(p_limit integer default 5)
returns setof public.flight_mail_outbox language plpgsql security definer set search_path = '' as $$
declare v_row public.flight_mail_outbox%rowtype;
begin
  if coalesce((select auth.role()), '') <> 'service_role' and coalesce((select public.sigv_role()), '') <> 'admin' then
    raise exception 'No tenés permiso para esta operación';
  end if;
  for v_row in
    select * from public.flight_mail_outbox
    where ((status in ('pending', 'retry') and next_attempt_at <= now())
      or (status = 'processing' and claimed_until < now()))
    order by created_at, id limit least(5, greatest(1, p_limit)) for update skip locked
  loop
    if v_row.status = 'processing' then
      insert into public.flight_mail_attempts(outbox_id, attempt, result, detail)
      values(v_row.id, v_row.attempts, 'lease_expired', 'La toma venció; se recupera el envío pendiente.');
    end if;
    update public.flight_mail_outbox set status = 'processing', attempts = attempts + 1,
      claim_token = gen_random_uuid(), claimed_until = now() + interval '5 minutes'
      where id = v_row.id returning * into v_row;
    insert into public.flight_mail_attempts(outbox_id, attempt, result) values(v_row.id, v_row.attempts, 'claimed');
    return next v_row;
  end loop;
end;
$$;

create or replace function public.sigv_finish_flight_mail(p_id uuid, p_token uuid, p_sent boolean, p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_row public.flight_mail_outbox%rowtype;
begin
  if coalesce((select auth.role()), '') <> 'service_role' and coalesce((select public.sigv_role()), '') <> 'admin' then
    raise exception 'No tenés permiso para esta operación';
  end if;
  select * into v_row from public.flight_mail_outbox where id = p_id and status = 'processing' and claim_token = p_token for update;
  if not found then raise exception 'La toma del correo ya no está disponible'; end if;
  update public.flight_mail_outbox set status = case when p_sent then 'sent' else 'retry' end,
    sent_at = case when p_sent then now() else null end, last_error = case when p_sent then null else left(p_error, 500) end,
    next_attempt_at = now() + (least(3600, 30 * power(2, least(v_row.attempts, 7)))::integer * interval '1 second'),
    claim_token = null, claimed_until = null where id = p_id;
  insert into public.flight_mail_attempts(outbox_id, attempt, result, detail)
    values(p_id, v_row.attempts, case when p_sent then 'sent' else 'retry' end, case when p_sent then null else left(p_error, 500) end);
end;
$$;
revoke all on function public.sigv_claim_flight_mail(integer) from public, anon, authenticated;
revoke all on function public.sigv_finish_flight_mail(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.sigv_claim_flight_mail(integer) to authenticated, service_role;
grant execute on function public.sigv_finish_flight_mail(uuid, uuid, boolean, text) to authenticated, service_role;
