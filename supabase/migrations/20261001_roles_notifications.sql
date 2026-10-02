-- Permisos de administración y avisos de cambios operativos.
grant select, update(role) on public.user_roles to authenticated;
create policy roles_admin_read on public.user_roles for select to authenticated
  using (public.sigv_role() = 'admin');
create policy roles_admin_update on public.user_roles for update to authenticated
  using (public.sigv_role() = 'admin') with check (public.sigv_role() = 'admin');

grant update(read_at) on public.notifications to authenticated;
create policy notification_update on public.notifications for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create or replace function public.sigv_flight_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    insert into public.notifications(owner_id, flight_id, title)
    select distinct owner_id, new.id,
      case when new.status = 'Cancelado' then 'Tu vuelo ' || new.id || ' fue cancelado'
           when new.status = 'Retrasado' then 'Tu vuelo ' || new.id || ' registra una demora'
           else 'Tu vuelo ' || new.id || ' volvió a estar activo' end
    from public.reservations where flight_id = new.id and status <> 'Cancelada';
    if new.status = 'Cancelado' then
      update public.reservations set status = 'Cancelada' where flight_id = new.id and status <> 'Cancelada';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.sigv_flight_changed() from public, anon, authenticated;
create trigger sigv_flight_status_changed after update of status on public.flights
  for each row execute function public.sigv_flight_changed();
