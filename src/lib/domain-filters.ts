export type DomainRow = Record<string, string | number | null>;

export const emptyDomainFilters = {
  status: "", origin: "", destination: "", from: "", to: "",
  scheduleId: "", weekday: "", cabin: "", flightId: "",
};

export type DomainFilters = typeof emptyDomainFilters;

export function domainStatus(row: DomainRow) {
  return row.archivedAt ? "Archivada" : String(row.status ?? "");
}

function overlapsSalePeriod(row: DomainRow, from: string, to: string) {
  if (!from && !to) return true;
  if (from && to && from > to) return false;
  if (typeof row.saleStart !== "string" || typeof row.saleEnd !== "string") return false;
  return (!from || row.saleEnd >= from) && (!to || row.saleStart <= to);
}

export function filterDomainRows<T extends DomainRow>(rows: readonly T[], filters: DomainFilters) {
  return rows.filter((row) =>
    (!filters.status || domainStatus(row) === filters.status) &&
    (!filters.origin || row.origin === filters.origin) &&
    (!filters.destination || row.destination === filters.destination) &&
    (!filters.scheduleId || String(row.scheduleId) === filters.scheduleId) &&
    (!filters.weekday || String(row.weekday) === filters.weekday) &&
    (!filters.cabin || row.cabin === filters.cabin) &&
    (!filters.flightId || row.flightId === filters.flightId) &&
    overlapsSalePeriod(row, filters.from, filters.to));
}

export function seatFlightOptions(flights: readonly DomainRow[], date: string) {
  return flights.filter((flight) => flight.id && (!date || flight.date === date)).map((flight) => {
    const route = flight.origin && flight.destination ? `${flight.origin} → ${flight.destination}` : "";
    const day = typeof flight.date === "string" ? flight.date : "";
    return {
      value: String(flight.id),
      label: [flight.code || flight.id, route, day.split("-").reverse().join("/")].filter(Boolean).join(" · "),
      keywords: day,
    };
  });
}
