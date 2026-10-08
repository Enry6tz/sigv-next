import test from "node:test";
import assert from "node:assert/strict";
import { durationMinutes, stopsLabel, searchFlights, bookingHref, parsePassengerCount, validReturnFlight, fareAvailable } from "../src/lib/passenger-search.ts";

const flight = { id: "AR-1420", origin: "EZE", destination: "BRC", date: "2026-10-14", departure: "23:30", arrival: "01:15", economy: 100, first: 250, seatsEconomy: 5, seatsFirst: 1, status: "Activo" };

test("calcula duración de vuelos nocturnos y respeta la duración informada", () => {
  assert.equal(durationMinutes(flight), 105);
  assert.equal(durationMinutes({ ...flight, durationMinutes: 180 }), 180);
  assert.equal(stopsLabel(flight), "Directo");
  assert.equal(stopsLabel({ ...flight, stops: ["GRU"] }), "1 escala · GRU");
  assert.equal(stopsLabel({ ...flight, stops: ["GRU", "COR"] }), "2 escalas · GRU, COR");
});

test("ida y vuelta conserva ambas cabinas y exige regreso por la ruta inversa después de la ida", () => {
  const returning = { ...flight, id: "return", origin: "BRC", destination: "EZE", date: "2026-10-16", departure: "10:00" };
  assert.equal(validReturnFlight(flight, returning), true);
  assert.equal(validReturnFlight(flight, { ...returning, origin: "COR" }), false);
  assert.equal(validReturnFlight(flight, { ...returning, date: "2026-10-13" }), false);
  assert.equal(validReturnFlight(flight, { ...returning, date: flight.date, departure: "23:45" }), false);
  const url = new URL(bookingHref(flight.id, "Primera", 2, { flight: "return", cabin: "Economy" }), "http://localhost");
  assert.equal(url.searchParams.get("returnFlight"), "return");
  assert.equal(url.searchParams.get("returnCabin"), "Economy");
});

test("busca por ruta y fecha y excluye cancelados, archivados y sin cupos suficientes", () => {
  const other = { ...flight, id: "other", departure: "10:00", arrival: "12:00", economy: 80, seatsFirst: 4 };
  const query = { origin: "EZE", destination: "BRC", date: "2026-10-14", passengers: 2 };
  const rows = [flight, other, { ...flight, id: "cancelled", status: "Cancelado" }, { ...flight, id: "archived", archivedAt: "2026-10-01" }, { ...flight, id: "full", seatsEconomy: 1, seatsFirst: 1 }, { ...flight, id: "route", destination: "SCL" }, { ...flight, id: "date", date: "2026-10-15" }];
  assert.deepEqual(searchFlights(rows, query, "price").map((f) => f.id), ["other", "AR-1420"]);
  assert.deepEqual(searchFlights(rows, query, "duration").map((f) => f.id), ["AR-1420", "other"]);
  assert.deepEqual(searchFlights(rows, query, "departure").map((f) => f.id), ["other", "AR-1420"]);
  assert.deepEqual(searchFlights(rows, query, "arrival").map((f) => f.id), ["AR-1420", "other"]);
});

test("ordena por la tarifa disponible para todo el grupo", () => {
  const cheapSoldOut = { ...flight, id: "first-only", economy: 1, seatsEconomy: 0, seatsFirst: 3 };
  assert.deepEqual(searchFlights([cheapSoldOut, flight], { origin: "EZE", destination: "BRC", date: flight.date, passengers: 2 }, "price").map((f) => f.id), ["AR-1420", "first-only"]);
});

test("la preferencia de cabina filtra resultados y ordena por su tarifa", () => {
  const econoOnly = { ...flight, id: "econo-only", economy: 50, seatsEconomy: 8, seatsFirst: 0, first: 999 };
  const firstOnly = { ...flight, id: "first-only", economy: 1, seatsEconomy: 0, seatsFirst: 4, first: 120 };
  const rows = [econoOnly, flight, firstOnly];
  const base = { origin: "EZE", destination: "BRC", date: flight.date, passengers: 1 };
  assert.deepEqual(searchFlights(rows, { ...base, cabin: "Primera" }, "price").map((f) => f.id), ["first-only", "AR-1420"]);
  assert.deepEqual(searchFlights(rows, { ...base, cabin: "Economy" }, "price").map((f) => f.id), ["econo-only", "AR-1420"]);
  assert.deepEqual(searchFlights(rows, { ...base, cabin: "" }, "price").map((f) => f.id), ["econo-only", "AR-1420", "first-only"]);
  assert.equal(fareAvailable(flight, "Primera", 1), 250);
  assert.equal(fareAvailable(flight, "", 1), 100);
});

test("conserva vuelo, cabina y pasajeros al continuar a la compra", () => {
  const url = new URL(bookingHref("AR-1420", "Primera", 3), "http://localhost");
  assert.equal(url.pathname, "/pasajero/compra");
  assert.equal(url.searchParams.get("flight"), "AR-1420");
  assert.equal(url.searchParams.get("cabin"), "Primera");
  assert.equal(url.searchParams.get("passengers"), "3");
  for (const value of ["0", "10", "2.5", "oops", ""]) assert.equal(parsePassengerCount(value), 1);
  assert.equal(parsePassengerCount("9"), 9);
});
