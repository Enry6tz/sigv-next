-- Compatibilidad: la migración inicial dejó un segundo trigger solo para estado.
-- El trigger completo sigv_flight_changed cubre estado, fecha y horas.
-- Evitamos emitir dos avisos sin borrar objetos del esquema en uso.
create or replace function public.sigv_flight_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_title text;
begin
  if tg_name = 'sigv_flight_status_changed' then return new; end if;

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
      update public.flights set seats_economy = capacity_economy, seats_first = capacity_first
        where id = new.id;
    end if;
  end if;
  return new;
end;
$$;
