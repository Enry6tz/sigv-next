-- Bloqueo de asientos sin permitir alterar check-ins ya realizados.
grant update(status) on public.flight_seats to authenticated;
create policy seats_admin_update on public.flight_seats for update to authenticated
  using (public.sigv_role() = 'admin' and status <> 'Ocupado')
  with check (public.sigv_role() = 'admin' and status in ('Disponible','Bloqueado'));
