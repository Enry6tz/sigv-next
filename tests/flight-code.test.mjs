import test from "node:test";
import assert from "node:assert/strict";
import { displayFlightCode } from "../src/lib/flight-code.ts";

test("muestra el código ingresado sin la fecha de la salida generada", () => {
  const flight = { id: "4545-20261021", scheduleId: "schedule-1" };
  assert.equal(displayFlightCode(flight), "4545");
  assert.equal(flight.id, "4545-20261021");
  assert.equal(displayFlightCode({ id: "AR-1420-20261021", scheduleId: "schedule-1" }), "AR-1420");
});
test("respeta códigos de vuelos individuales, incluso si terminan en números", () => {
  assert.equal(displayFlightCode({ id: "AR-1420" }), "AR-1420");
  assert.equal(displayFlightCode({ id: "AR-20261021" }), "AR-20261021");
});
test("usa el código de la API y conserva el código al cambiar la fecha", () => {
  assert.equal(displayFlightCode({ id: "4545-20261021", code: "4545" }), "4545");
  assert.equal(displayFlightCode({ id: "4545-20261021", scheduleId: "schedule-1", date: "2026-10-22" }), "4545");
});
