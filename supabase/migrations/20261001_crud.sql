-- Bajas recuperables de vuelos y cancelación transaccional de reservas.
alter table public.flights add column archived_at timestamptz;

create or replace function public.sigv_cancel_reservation(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_reservation public.reservations%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Iniciá sesión para cancelar'; end if;
  select * into v_reservation from public.reservations where code = p_code for update;
  if not found then raise exception 'Reserva no encontrada'; end if;
  if v_reservation.owner_id <> (select auth.uid()) and public.sigv_role() <> 'admin' then
    raise exception 'No tenés permiso sobre esta reserva';
  end if;
  if v_reservation.status = 'Cancelada' then raise exception 'La reserva ya está cancelada'; end if;
  if exists (select 1 from public.reservation_passengers
    where reservation_id = v_reservation.id and checked_in_at is not null) then
    raise exception 'No se puede cancelar una reserva con check-in';
  end if;
  update public.reservations set status = 'Cancelada' where id = v_reservation.id;
  if v_reservation.cabin = 'Economy' then
    update public.flights set seats_economy = least(capacity_economy, seats_economy + v_reservation.passenger_count)
      where id = v_reservation.flight_id;
  else
    update public.flights set seats_first = least(capacity_first, seats_first + v_reservation.passenger_count)
      where id = v_reservation.flight_id;
  end if;
  return jsonb_build_object('reservationCode', p_code, 'status', 'Cancelada');
end;
$$;
revoke all on function public.sigv_cancel_reservation(text) from public, anon, authenticated;
grant execute on function public.sigv_cancel_reservation(text) to authenticated;
