-- Limpieza de la validación del 01/10/2026. NO es una migración.
-- Ejecutar en el proyecto zfchbgjwspslpqnsdkrs únicamente tras autorizar
-- la eliminación definitiva de estos datos de prueba.
-- Después borrar las dos cuentas temporales desde Supabase Auth > Users.
begin;

do $$
begin
  if (select count(*) from auth.users where id in (
    '0657c3b6-95c0-4d1d-86bd-60924975ee55',
    '3e0ade10-ed49-434c-b1c6-fd15a67e6ffa')) <> 2
    or (select count(*) from public.reservations
        where owner_id = '0657c3b6-95c0-4d1d-86bd-60924975ee55'
        and code in ('SIGV-94A1CFB0','SIGV-D19E1182')) <> 2
    or (select count(*) from public.reservations
        where owner_id = '0657c3b6-95c0-4d1d-86bd-60924975ee55') <> 2
    or (select count(*) from public.notifications
        where owner_id = '0657c3b6-95c0-4d1d-86bd-60924975ee55') <> 6
    or (select count(*) from public.reservations
        where flight_id = 'AR-1420'
        and owner_id <> '0657c3b6-95c0-4d1d-86bd-60924975ee55') <> 0
    or (select count(*) from public.flights
        where id in ('AR-TST1','AR-TSTR-20261016','AR-TSTR-20261023')) <> 3
    or (select count(*) from public.flight_schedules where code = 'AR-TSTR') <> 1
    or (select count(*) from public.aircraft where registration = 'LV-TST') <> 1
    or (select count(*) from public.airports where code = 'TST') <> 1
    or (select seats_economy from public.flights where id = 'AR-1420') is distinct from 83
    or (select capacity_economy from public.flights where id = 'AR-1420') is distinct from 84
    or (select status from public.flight_seats
        where flight_id = 'AR-1420' and code = '3A') is distinct from 'Ocupado' then
    raise exception 'Inventario de prueba distinto al esperado; no se eliminó nada';
  end if;
end;
$$;

delete from public.notifications
  where owner_id = '0657c3b6-95c0-4d1d-86bd-60924975ee55';

delete from public.payments
  where reservation_id in (
    select id from public.reservations
    where owner_id = '0657c3b6-95c0-4d1d-86bd-60924975ee55'
      and code in ('SIGV-94A1CFB0','SIGV-D19E1182'));
-- invoices se elimina por la FK ON DELETE CASCADE de payments.

delete from public.reservations
  where owner_id = '0657c3b6-95c0-4d1d-86bd-60924975ee55'
    and code in ('SIGV-94A1CFB0','SIGV-D19E1182');
-- reservation_passengers se elimina por su FK ON DELETE CASCADE.

update public.flight_seats set status = 'Disponible'
  where flight_id = 'AR-1420' and code = '3A' and status = 'Ocupado';
update public.flights set seats_economy = capacity_economy
  where id = 'AR-1420';
delete from public.flight_change_logs
  where flight_id = 'AR-1420'
    and actor_id = '3e0ade10-ed49-434c-b1c6-fd15a67e6ffa';

delete from public.flights
  where id in ('AR-TST1','AR-TSTR-20261016','AR-TSTR-20261023');
delete from public.flight_schedules where code = 'AR-TSTR';
delete from public.aircraft where registration = 'LV-TST';
delete from public.airports where code = 'TST';

commit;
