export type ReportFlight = { id: string; date: string; capacityEconomy: number; capacityFirst: number };
export type ReportPassenger = { reservationCode: string; passenger: string; document: string };
export type ReportReservation = {
  code: string; flightId: string; cabin: string; status: string;
  passengers: { first_name: string; last_name: string; document: string }[];
};
export type OccupancyRow = {
  flightId: string; date: string; cabin: "Economy" | "Primera";
  sold: number; capacity: number; occupancy: number; passengers: ReportPassenger[];
};

export function buildOccupancyReport(flights: ReportFlight[], reservations: ReportReservation[], filters = new URLSearchParams()): OccupancyRow[] {
  const flightId = filters.get("flightId")?.trim();
  const cabin = filters.get("cabin")?.trim();
  const from = filters.get("from") || "";
  const to = filters.get("to") || "";
  for (const date of [from, to]) {
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date))
      throw new Error("Ingresa fechas válidas para consultar el reporte.");
  }
  if (from && to && from > to) throw new Error("La fecha Desde no puede ser posterior a Hasta.");
  if (cabin && cabin !== "Economy" && cabin !== "Primera") throw new Error("Selecciona una clase válida.");
  return flights.filter((flight) => (!flightId || flight.id === flightId) && (!from || flight.date >= from) && (!to || flight.date <= to))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .flatMap((flight) => (["Economy", "Primera"] as const).filter((value) => !cabin || value === cabin).map((value) => {
      const passengers = reservations.filter((booking) => booking.flightId === flight.id && booking.cabin === value && booking.status === "Confirmada")
        .flatMap((booking) => booking.passengers.map((person) => ({ reservationCode: booking.code, passenger: `${person.first_name} ${person.last_name}`, document: person.document })));
      const capacity = value === "Economy" ? flight.capacityEconomy : flight.capacityFirst;
      return { flightId: flight.id, date: flight.date, cabin: value, sold: passengers.length, capacity,
        occupancy: capacity > 0 ? Math.round(passengers.length / capacity * 10000) / 100 : 0, passengers };
    }));
}

export function reportTotals(rows: OccupancyRow[]) {
  const sold = rows.reduce((total, row) => total + row.sold, 0);
  const capacity = rows.reduce((total, row) => total + row.capacity, 0);
  return { sold, flights: new Set(rows.map((row) => `${row.flightId}/${row.date}`)).size, capacity,
    average: rows.length ? Math.round(rows.reduce((total, row) => total + row.occupancy, 0) / rows.length * 100) / 100 : 0,
    weightedOccupancy: capacity > 0 ? Math.round(sold / capacity * 10000) / 100 : 0 };
}

export function occupancyCsv(rows: OccupancyRow[]) {
  const cell = (value: string | number) => `"${String(value).replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
  return "\uFEFFVuelo,Fecha,Clase,Pasajes vendidos,Capacidad,Ocupación (%)\r\n" + rows.map((row) =>
    [row.flightId, row.date, row.cabin, row.sold, row.capacity, row.occupancy].map(cell).join(",")).join("\r\n");
}
