export function displayFlightCode(flight: { id: string; code?: string; scheduleId?: string | null }): string {
  if (flight.code) return flight.code;
  // Generated departures use <schedule code>-YYYYMMDD as their internal ID.
  // Only scheduled flights have this suffix; standalone flight codes stay intact.
  return flight.scheduleId ? flight.id.replace(/-\d{8}$/, "") : flight.id;
}
