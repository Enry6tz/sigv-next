import type { Flight } from "./mock-data";

export type Cabin = "Economy" | "Primera";
export type FlightSort = "price" | "duration" | "departure" | "arrival";
export type PassengerQuery = { origin: string; destination: string; date: string; passengers?: string; trip?: string; returnDate?: string; cabin?: string };

export function parsePassengerCount(value?: string) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= 9 ? count : 1;
}

const clockMinutes = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

export function durationMinutes(flight: Flight) {
  if (flight.durationMinutes !== undefined) return flight.durationMinutes;
  const difference = clockMinutes(flight.arrival) - clockMinutes(flight.departure);
  return difference < 0 ? difference + 1440 : difference;
}

export function stopsLabel(flight: Flight) {
  const stops = flight.stops ?? [];
  return stops.length ? `${stops.length} ${stops.length === 1 ? "escala" : "escalas"} · ${stops.join(", ")}` : "Directo";
}

export function cabinAvailable(flight: Flight, cabin: Cabin, count: number) {
  return flight.status !== "Cancelado" && !flight.archivedAt &&
    (cabin === "Economy" ? flight.seatsEconomy : flight.seatsFirst) >= count;
}

// Mejor tarifa utilizable para el grupo, opcionalmente restringida a una cabina.
export function fareAvailable(flight: Flight, cabin: Cabin | "" | null | undefined, count: number) {
  if (cabin) return cabinAvailable(flight, cabin, count) ? (cabin === "Economy" ? flight.economy : flight.first) : Infinity;
  return Math.min(
    cabinAvailable(flight, "Economy", count) ? flight.economy : Infinity,
    cabinAvailable(flight, "Primera", count) ? flight.first : Infinity,
  );
}

export function searchFlights(flights: Flight[], query: Omit<PassengerQuery, "passengers"> & { passengers: number }, sort: FlightSort) {
  // Una preferencia de cabina concreta filtra los resultados a vuelos con cupos en
  // esa cabina y ordena el precio con su tarifa.
  const preferred = query.cabin === "Economy" || query.cabin === "Primera" ? query.cabin : null;
  return flights.filter((flight) => flight.origin === query.origin && flight.destination === query.destination && flight.date === query.date &&
    (preferred ? cabinAvailable(flight, preferred, query.passengers)
      : cabinAvailable(flight, "Economy", query.passengers) || cabinAvailable(flight, "Primera", query.passengers)))
    .sort((a, b) => sort === "price" ? fareAvailable(a, preferred, query.passengers) - fareAvailable(b, preferred, query.passengers) : sort === "duration" ? durationMinutes(a) - durationMinutes(b) : clockMinutes(a[sort]) - clockMinutes(b[sort]));
}

export function validReturnFlight(outbound: Flight, returning: Flight) {
  const departure = Date.parse(`${outbound.date}T00:00:00Z`) + clockMinutes(outbound.departure) * 60000;
  const returnDeparture = Date.parse(`${returning.date}T00:00:00Z`) + clockMinutes(returning.departure) * 60000;
  return outbound.id !== returning.id && outbound.origin === returning.destination && outbound.destination === returning.origin &&
    returnDeparture > departure + durationMinutes(outbound) * 60000;
}

export function bookingHref(flight: string, cabin: Cabin, passengers: number, returning?: { flight: string; cabin: Cabin }) {
  const query = new URLSearchParams({ flight, cabin, passengers: String(passengers) });
  if (returning) { query.set("returnFlight", returning.flight); query.set("returnCabin", returning.cabin); }
  return `/pasajero/compra?${query}`;
}
