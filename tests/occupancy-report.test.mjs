import test from "node:test";
import assert from "node:assert/strict";
import { buildOccupancyReport, reportTotals, occupancyCsv } from "../src/lib/occupancy-report.ts";

const flights = [
  { id: "F1", date: "2026-11-10", capacityEconomy: 10, capacityFirst: 2 },
  { id: "F2", date: "2026-11-11", capacityEconomy: 20, capacityFirst: 0 },
];
const person = (name, document) => ({ first_name: name, last_name: "Prueba", document });
const reservations = [
  { code: "R1", flightId: "F1", cabin: "Economy", status: "Confirmada", passengers: [person("Ana", "30111222"), person("Luis", "30111223"), person("Eva", "30111224")] },
  { code: "R2", flightId: "F1", cabin: "Economy", status: "Pendiente de pago", passengers: [person("Pendiente", "30111225")] },
  { code: "R3", flightId: "F1", cabin: "Economy", status: "Cancelada", passengers: [person("Cancelado", "30111226")] },
];

test("ocupación cuenta pasajeros confirmados y no reservas, pendientes ni canceladas", () => {
  const rows = buildOccupancyReport(flights, reservations);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].sold, 3);
  assert.equal(rows[0].capacity, 10);
  assert.equal(rows[0].occupancy, 30);
  assert.deepEqual(rows[0].passengers.map((p) => p.document), ["30111222", "30111223", "30111224"]);
  assert.equal(rows[1].sold, 0);
  assert.deepEqual(rows[1].passengers, []);
});

test("los filtros combinan vuelo, clase y fechas inclusivas y se limpian sin perder filas cero", () => {
  const rows = buildOccupancyReport(flights, reservations, new URLSearchParams({ flightId: "F1", cabin: "Economy", from: "2026-11-10", to: "2026-11-10" }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sold, 3);
  assert.equal(buildOccupancyReport(flights, reservations).length, 4);
  assert.deepEqual(buildOccupancyReport(flights, reservations, new URLSearchParams({ from: "2027-01-01" })), []);
  assert.throws(() => buildOccupancyReport(flights, reservations, new URLSearchParams({ from: "2026-11-12", to: "2026-11-10" })), /Desde/);
  assert.throws(() => buildOccupancyReport(flights, reservations, new URLSearchParams({ from: "2026-02-30" })), /fechas válidas/);
  assert.throws(() => buildOccupancyReport(flights, reservations, new URLSearchParams({ cabin: "Otra" })), /clase válida/);
});

test("totales no duplican vuelos por clase y diferencian promedio de ocupación global", () => {
  assert.deepEqual(reportTotals(buildOccupancyReport(flights, reservations)), { sold: 3, flights: 2, capacity: 32, average: 7.5, weightedOccupancy: 9.38 });
  assert.deepEqual(reportTotals([]), { sold: 0, flights: 0, capacity: 0, average: 0, weightedOccupancy: 0 });
});

test("cada detalle tiene exactamente los pasajes vendidos y exportar respeta las filas filtradas", () => {
  const rows = buildOccupancyReport(flights, reservations, new URLSearchParams({ flightId: "F1", cabin: "Economy" }));
  for (const row of rows) assert.equal(row.passengers.length, row.sold);
  assert.equal(rows[0].passengers[0].reservationCode, "R1");
  assert.equal(rows[0].passengers[0].passenger, "Ana Prueba");
  assert.match(occupancyCsv(rows), /"F1","2026-11-10","Economy","3","10","30"/);
  assert.doesNotMatch(occupancyCsv(rows), /F2|30111222/);
  assert.match(occupancyCsv([{ ...rows[0], flightId: '=HYPERLINK("x")' }]), /'=HYPERLINK/);
});
