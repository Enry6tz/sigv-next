-- El trigger ya compara fecha y horarios; se dispara también cuando cambian esos campos.
create or replace trigger sigv_flight_status_changed
  after update of status, flight_date, departure, arrival on public.flights
  for each row execute function public.sigv_flight_changed();
