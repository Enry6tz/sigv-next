import test from "node:test";
import assert from "node:assert/strict";

const base = process.env.PASSENGER_TEST_BASE_URL;
const integration = { skip: !base && "Definí PASSENGER_TEST_BASE_URL para ejecutar contra un servidor mock" };
async function post(resource, payload) {
  const response = await fetch(`${base}/api/data/${resource}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return { status: response.status, body: await response.json() };
}
const people = [{ firstName: "Prueba", lastName: "Uno", document: "QA-FLOW-1" }, { firstName: "Prueba", lastName: "Dos", document: "QA-FLOW-2" }];

test("búsqueda pública y portal muestran el mismo buscador sin barra lateral", integration, async () => {
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.provider, "mock", "Esta prueba solo crea datos simulados");
  for (const path of ["/", "/pasajero/buscar-vuelos"]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /passenger-search-form/);
    assert.match(html, /Fecha de vuelta/);
    assert.doesNotMatch(html, /class="sidebar"/);
  }
});

test("reserva y paga dos tramos conservando cabinas diferentes y el grupo", integration, async () => {
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.provider, "mock", "No ejecutar mutaciones en un proveedor real");
  const result = await post("reservations", { flightId: "AR-1420", cabin: "Primera", returnFlightId: "AR-1421", returnCabin: "Economy", passengerCount: 2, passengers: people });
  assert.equal(result.status, 202);
  assert.equal(result.body.data.cabin, "Primera");
  assert.equal(result.body.data.seats, 2);
  assert.equal(result.body.data.returnReservation.cabin, "Economy");
  assert.equal(result.body.data.returnReservation.seats, 2);
  const payment = await post("payments", { reservationCode: result.body.data.code, returnReservationCode: result.body.data.returnReservation.code, method: "Tarjeta de prueba" });
  assert.equal(payment.status, 202);
  assert.ok(payment.body.data.invoice);
  assert.ok(payment.body.data.returnPayment.invoice);
});

test("rechaza regreso inválido, grupo sin cupos, cabina inválida y documentos duplicados", integration, async () => {
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.provider, "mock");
  const booking = { flightId: "AR-1420", cabin: "Economy", passengerCount: 2, passengers: people };
  for (const payload of [{ ...booking, returnFlightId: "AR-2231", returnCabin: "Economy" }, { ...booking, cabin: "Otra" }, { ...booking, passengers: [people[0], people[0]] }, { ...booking, returnFlightId: "AR-1421", returnCabin: "Primera", passengerCount: 9, passengers: Array.from({ length: 9 }, (_, index) => ({ ...people[0], document: `QA-${index}` })) }]) {
    assert.equal((await post("reservations", payload)).status, 400);
  }
});
