import test from "node:test";
import assert from "node:assert/strict";
import { countDepartures, durationMinutes, validateFlightSchedule } from "../src/lib/flight-schedule.ts";

const aircraft = { id: "00000000-0000-4000-8000-000000000001", capacityEconomy: 120, capacityFirst: 12, status: "Activa" };
const valid = {
  flightCode: "AR-1420", aircraftId: aircraft.id, origin: "EZE", destination: "BRC",
  departure: "22:30", arrival: "01:15", saleStart: "2026-10-06", saleEnd: "2026-10-12",
  weekdays: [1, 3, 5], economy: "65000", first: "140000", seatsEconomy: "120", seatsFirst: "12",
  baggageIncluded: false, seatSelectionEnabled: true, onlineCheckInEnabled: true,
};

test("calcula duración normal y llegada al día siguiente", () => {
  assert.equal(durationMinutes("10:00", "12:45"), 165);
  assert.equal(durationMinutes("22:30", "01:15"), 165);
  assert.equal(durationMinutes("25:00", "12:45"), null);
  assert.equal(durationMinutes("", ""), null);
});
test("cuenta vuelos solo en los días elegidos e incluye ambos extremos", () => {
  assert.equal(countDepartures(valid.saleStart, valid.saleEnd, valid.weekdays), 3);
  assert.equal(countDepartures("2026-10-12", "2026-10-12", [1]), 1);
  assert.equal(countDepartures("2026-10-12", "2026-10-12", [2]), 0);
  assert.equal(countDepartures("2026-10-12", "2026-10-06", [1]), 0);
});
test("acepta el alta completa con notas y cupos válidos", () => {
  assert.equal(validateFlightSchedule(valid, aircraft), null);
});
for (const [name, changes, expected] of [
  ["origen igual al destino", { destination: "EZE" }, /deben ser diferentes/],
  ["aeronave faltante", { aircraftId: "" }, /aeronave/],
  ["sin días de operación", { weekdays: [] }, /al menos un día/],
  ["días repetidos", { weekdays: [1, 1] }, /sin repetir/],
  ["día inválido", { weekdays: [7] }, /sin repetir/],
  ["fechas invertidas", { saleEnd: "2026-10-05" }, /igual o posterior/],
  ["fecha inexistente", { saleStart: "2026-02-30" }, /fechas/],
  ["período demasiado largo", { saleEnd: "2027-10-08" }, /366/],
  ["período sin salidas", { saleEnd: "2026-10-06" }, /no incluye/],
  ["horarios iguales", { arrival: valid.departure }, /horarios/],
  ["cupos decimales", { seatsEconomy: "10.5" }, /entero/],
  ["cupos excesivos por clase", { seatsEconomy: "121", seatsFirst: "0" }, /capacidad de la aeronave/],
  ["cupos vacíos", { seatsEconomy: "" }, /entero/],
  ["sin asientos", { seatsEconomy: "0", seatsFirst: "0" }, /al menos un asiento/],
  ["tarifa negativa", { economy: "-1" }, /tarifa/],
  ["tarifa vacía", { first: "" }, /tarifa/],
  ["notas omitidas", { baggageIncluded: undefined }, /opciones adicionales/],
]) test(`rechaza ${name} con un mensaje para el usuario`, () => {
  assert.match(validateFlightSchedule({ ...valid, ...changes }, aircraft), expected);
});
test("rechaza una aeronave archivada o en mantenimiento", () => {
  assert.match(validateFlightSchedule(valid, { ...aircraft, archivedAt: "2026-10-01" }), /ya no está disponible/);
  assert.match(validateFlightSchedule(valid, { ...aircraft, status: "Mantenimiento" }), /ya no está disponible/);
});
