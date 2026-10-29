import test from "node:test";
import assert from "node:assert/strict";
import { flightPolicyProblem, flightStatus, nextFlightStatus } from "../src/lib/flight-policy.ts";

const flight = { date: "2030-06-20", departure: "10:00", arrival: "12:00", scheduledDeparture: "10:00", status: "Activo" };
const before = new Date("2030-06-17T12:00:00Z");
test("US-033: terminales rechazan indicando su estado", () => {
  for (const status of ["Cancelado", "Reprogramado", "Operado"])
    assert.match(flightPolicyProblem({ ...flight, status }, { departure: "11:00" }, before), new RegExp(status));
});
test("US-033: cada demora reemplaza la salida vigente y el adelanto recupera el estado", () => {
  assert.equal(flightPolicyProblem(flight, { departure: "11:00", arrival: "13:00" }, before), null);
  assert.equal(nextFlightStatus(flight, { departure: "11:00" }), "Retrasado");
  assert.equal(nextFlightStatus({ ...flight, departure: "11:00", status: "Retrasado" }, { departure: "10:30" }), "Retrasado");
  assert.equal(nextFlightStatus({ ...flight, departure: "11:00", status: "Retrasado" }, { departure: "09:30" }), "Activo");
});
test("US-033: bloquea cambio de fecha dentro de 48 horas y admite fuera del límite", () => {
  assert.match(flightPolicyProblem(flight, { date: "2030-06-21" }, new Date("2030-06-18T13:00:00Z")), /48 horas/);
  assert.equal(flightPolicyProblem(flight, { date: "2030-06-21" }, before), null);
});
test("US-033: más de dos horas sin despegue se considera Operado, no antes ni con despegue", () => {
  assert.equal(flightStatus(flight, new Date("2030-06-20T15:00:00Z")), "Activo");
  assert.equal(flightStatus(flight, new Date("2030-06-20T15:00:01Z")), "Operado");
  assert.equal(flightStatus({ ...flight, takenOffAt: "2030-06-20T13:00:00Z" }, new Date("2030-06-20T16:00:00Z")), "Activo");
  assert.match(flightPolicyProblem(flight, { departure: "14:00" }, new Date("2030-06-20T15:00:01Z")), /Operado/);
});
test("US-033: demora exige hora y conserva compatibilidad de cancelación", () => {
  assert.match(flightPolicyProblem(flight, { status: "Retrasado" }, before), /hora/);
  assert.equal(flightPolicyProblem(flight, { status: "Cancelado" }, before), null);
  assert.equal(nextFlightStatus(flight, { status: "Cancelado" }), "Cancelado");
  assert.match(flightPolicyProblem(flight, { departure: "25:30" }, before), /horario/);
  assert.equal(nextFlightStatus({ ...flight, status: "Retrasado" }, {}), "Retrasado");
});

const base = process.env.PASSENGER_TEST_BASE_URL;
test("US-033: API exige nueva hora para demora y devuelve salida vigente", { skip: !base && "Requiere servidor mock" }, async () => {
  assert.equal((await (await fetch(`${base}/api/health`)).json()).provider, "mock");
  const change = (body) => fetch(`${base}/api/data/disruptions`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const missing = await change({ flightId: "AR-1420", status: "Retrasado" });
  assert.equal(missing.status, 400);
  assert.match((await missing.json()).error, /hora/);
  const delayed = await change({ flightId: "AR-1420", status: "Retrasado", departure: "08:00", arrival: "10:00" });
  assert.equal(delayed.status, 202);
  const result = await delayed.json();
  assert.equal(result.data.departure, "08:00");
  assert.equal(result.data.status, "Retrasado");
  assert.equal(result.persisted, false);
});
