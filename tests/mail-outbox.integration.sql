-- Ejecutar EXCLUSIVAMENTE en el clúster temporal del integrador, tras todas las migraciones.
-- psql -v SIGV_MAIL_ISOLATED_TEST=1 -f tests/mail-outbox.integration.sql
-- No abre conexiones remotas ni envía SMTP. Deja fixtures QA en la base desechable.
\set ON_ERROR_STOP on
\if :{?SIGV_MAIL_ISOLATED_TEST}
\else
  \echo 'Falta la confirmación SIGV_MAIL_ISOLATED_TEST del clúster temporal.'
  \quit 3
\endif

begin;
insert into auth.users(id, email) values
 ('00000000-0000-4000-8000-000000000025', 'qa-mail-admin@example.test'),
 ('00000000-0000-4000-8000-000000000026', 'qa-mail-one@example.test'),
 ('00000000-0000-4000-8000-000000000027', 'qa-mail-two@example.test');
insert into public.profiles(user_id, email, name) values
 ('00000000-0000-4000-8000-000000000025', 'qa-mail-admin@example.test', 'QA Mail Admin'),
 ('00000000-0000-4000-8000-000000000026', 'qa-mail-one@example.test', 'QA One'),
 ('00000000-0000-4000-8000-000000000027', 'qa-mail-two@example.test', 'QA Two')
on conflict(user_id) do update set email = excluded.email, name = excluded.name;
insert into public.user_roles(user_id, role) values
 ('00000000-0000-4000-8000-000000000025', 'admin'),
 ('00000000-0000-4000-8000-000000000026', 'pasajero'),
 ('00000000-0000-4000-8000-000000000027', 'pasajero')
on conflict(user_id) do update set role = excluded.role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000025', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000025","role":"authenticated"}', false);
insert into public.airports(code, city, name) values ('QMA', 'QA origen', 'QA Mail Origen'), ('QMB', 'QA destino', 'QA Mail Destino');
insert into public.flights(id, origin, destination, flight_date, departure, arrival, economy, first,
  seats_economy, seats_first, capacity_economy, capacity_first)
values ('QA-MAIL-001', 'QMA', 'QMB', current_date + 10, '12:00', '13:00', 100, 200, 7, 2, 10, 2);
insert into public.reservations(id, code, owner_id, flight_id, cabin, passenger_count, total_amount, status, contact_email) values
 ('10000000-0000-4000-8000-000000000025', 'QA-MAIL-CONF-1', '00000000-0000-4000-8000-000000000026', 'QA-MAIL-001', 'Economy', 2, 200, 'Confirmada', 'contact-one@example.test'),
 ('10000000-0000-4000-8000-000000000026', 'QA-MAIL-CONF-2', '00000000-0000-4000-8000-000000000027', 'QA-MAIL-001', 'Economy', 1, 100, 'Confirmada', null),
 ('10000000-0000-4000-8000-000000000027', 'QA-MAIL-PENDING', '00000000-0000-4000-8000-000000000027', 'QA-MAIL-001', 'Economy', 1, 100, 'Pendiente de pago', 'pending@example.test');
insert into public.reservation_passengers(reservation_id, flight_id, first_name, last_name, document) values
 ('10000000-0000-4000-8000-000000000025', 'QA-MAIL-001', 'Ana', 'Prueba', '30000001'),
 ('10000000-0000-4000-8000-000000000025', 'QA-MAIL-001', 'Luis', 'Prueba', '30000002'),
 ('10000000-0000-4000-8000-000000000026', 'QA-MAIL-001', 'Eva', 'Prueba', '30000003');

update public.flights set change_reason = 'No es un evento operativo' where id = 'QA-MAIL-001';
do $$ begin
 if exists(select 1 from public.flight_mail_outbox where flight_id = 'QA-MAIL-001') then raise exception 'Modificar solo motivo no debe enviar'; end if;
 raise notice 'PASS reason-only no resend';
end $$;
update public.flights set status = 'Cancelado', change_reason = E'Cuestiones climáticas\nRevisión <operativa> & seguridad' where id = 'QA-MAIL-001';
do $$
begin
 if (select count(*) from public.flight_mail_outbox where flight_id = 'QA-MAIL-001') <> 2 then raise exception 'Cancelación: deben encolarse las dos confirmadas antes de cambiar sus estados'; end if;
 if exists(select 1 from public.flight_mail_outbox where reservation_code = 'QA-MAIL-PENDING') then raise exception 'No se debe enviar correo de pasaje confirmado a pendientes'; end if;
 if (select recipient from public.flight_mail_outbox where reservation_code = 'QA-MAIL-CONF-2') <> 'qa-mail-two@example.test' then raise exception 'Debe usarse el correo del propietario si falta contacto'; end if;
 if (select payload->>'reason' from public.flight_mail_outbox where reservation_code = 'QA-MAIL-CONF-1') <> E'Cuestiones climáticas\nRevisión <operativa> & seguridad' then raise exception 'El motivo no se conservó literalmente'; end if;
 if (select jsonb_array_length(payload->'passengers') from public.flight_mail_outbox where reservation_code = 'QA-MAIL-CONF-1') <> 2 then raise exception 'Faltan nombres de acompañantes en el aviso al contacto'; end if;
 if exists(select 1 from public.reservations where flight_id = 'QA-MAIL-001' and status = 'Confirmada') then raise exception 'La política previa de cancelación debe seguir funcionando'; end if;
 raise notice 'PASS cancellation recipients, pending exclusion, owner fallback, literal reason and reservation policy';
end $$;

insert into public.flights(id, origin, destination, flight_date, departure, arrival, economy, first,
  seats_economy, seats_first, capacity_economy, capacity_first)
values ('QA-MAIL-002', 'QMA', 'QMB', current_date + 11, '12:00', '13:00', 100, 200, 9, 2, 10, 2);
insert into public.reservations(id, code, owner_id, flight_id, cabin, passenger_count, total_amount, status, contact_email) values
 ('10000000-0000-4000-8000-000000000028', 'QA-MAIL-RESCHEDULE', '00000000-0000-4000-8000-000000000026', 'QA-MAIL-002', 'Economy', 1, 100, 'Confirmada', 'contact-one@example.test');
insert into public.reservation_passengers(reservation_id, flight_id, first_name, last_name, document) values
 ('10000000-0000-4000-8000-000000000028', 'QA-MAIL-002', 'Ana', 'Prueba', '30000001');
update public.flights set departure = '12:30', arrival = '13:30', change_reason = '' where id = 'QA-MAIL-002';
update public.flights set departure = '12:30', arrival = '13:30' where id = 'QA-MAIL-002';
do $$ begin
 if (select count(*) from public.flight_mail_outbox where flight_id = 'QA-MAIL-002') <> 1 then raise exception 'Un cambio horario debe generar un único evento; un no-op no reenvía'; end if;
 if not exists(select 1 from public.flight_mail_outbox where flight_id = 'QA-MAIL-002' and payload->>'kind' = 'rescheduled'
   and payload->'previous'->>'departure' = '12:00:00' and payload->'current'->>'departure' = '12:30:00'
   and payload->>'reason' = '') then raise exception 'Faltan itinerarios anterior/nuevo y motivo vacío'; end if;
 raise notice 'PASS reschedule itinerary, optional reason and no-op deduplication';
end $$;

do $$
declare a public.flight_mail_outbox%rowtype; b public.flight_mail_outbox%rowtype; recovered public.flight_mail_outbox%rowtype;
begin
 select * into a from public.sigv_claim_flight_mail(1);
 select * into b from public.sigv_claim_flight_mail(1);
 if a.id is null or b.id is null or a.id = b.id then raise exception 'Las tomas activas no pueden repetirse'; end if;
 perform public.sigv_finish_flight_mail(a.id, a.claim_token, true, null);
 perform public.sigv_finish_flight_mail(b.id, b.claim_token, false, 'SMTP de pruebas no disponible');
 if (select status from public.flight_mail_outbox where id = b.id) <> 'retry' then raise exception 'Falla SMTP debe conservar reintento'; end if;
 if (select next_attempt_at <= now() from public.flight_mail_outbox where id = b.id) then raise exception 'Debe respetarse el backoff'; end if;
 update public.flight_mail_outbox set status = 'processing', claimed_until = now() - interval '1 second' where id = b.id;
 select * into recovered from public.sigv_claim_flight_mail(1);
 if recovered.id <> b.id or recovered.claim_token = b.claim_token then raise exception 'La toma vencida debe recuperarse con otro token'; end if;
 begin
  perform public.sigv_finish_flight_mail(b.id, b.claim_token, true, null);
  raise sqlstate 'ZX001' using message = 'Se aceptó un token vencido';
 exception when sqlstate 'P0001' then
  if sqlerrm <> 'La toma del correo ya no está disponible' then raise; end if;
 end;
 perform public.sigv_finish_flight_mail(recovered.id, recovered.claim_token, true, null);
 if not exists(select 1 from public.flight_mail_attempts where outbox_id = b.id and result = 'lease_expired') then raise exception 'Falta historial de recuperación'; end if;
 raise notice 'PASS active-claim exclusion, SMTP retry/backoff, expired lease, stale token and history';
end $$;
commit;

begin;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000026', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000026","role":"authenticated"}', false);
set local role authenticated;
do $$ begin
 if (select count(*) from public.flight_mail_outbox) <> 0 then raise exception 'RLS expone destinatarios a pasajero'; end if;
 begin
  perform public.sigv_claim_flight_mail(1);
  raise sqlstate 'ZX001' using message = 'Un pasajero procesó la cola';
 exception when sqlstate 'P0001' then
  if sqlerrm <> 'No tenés permiso para esta operación' then raise; end if;
 end;
 begin
  update public.flight_mail_outbox set status = 'sent';
  raise sqlstate 'ZX001' using message = 'Se permitieron escrituras directas';
 exception when insufficient_privilege then null;
 end;
 raise notice 'PASS passenger RLS, processing denial and direct-write denial';
end $$;
rollback;

-- Preparar dos filas exclusivas para la prueba REAL entre sesiones del integrador.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000025', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000025","role":"authenticated"}', false);
insert into public.flight_mail_outbox(event_id, reservation_id, reservation_code, flight_id, recipient, payload)
select gen_random_uuid(), reservation_id, reservation_code, flight_id, recipient, payload
from public.flight_mail_outbox where flight_id = 'QA-MAIL-001' limit 2;
-- Sesión A: configurar los mismos claims de administrador; BEGIN; SELECT id FROM sigv_claim_flight_mail(1); SELECT pg_sleep(3); COMMIT;
-- Mientras A duerme, sesión B: claims de administrador; SELECT id FROM sigv_claim_flight_mail(1).
-- B debe responder antes del COMMIT de A y devolver otro id. No basta una prueba secuencial para afirmar concurrencia.
select 'READY_FOR_TWO_SESSION_CLAIM_PROBE' as result;
