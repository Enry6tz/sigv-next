import test from "node:test";
import assert from "node:assert/strict";

const base = process.env.PASSENGER_TEST_BASE_URL;
const integration = { skip: !base && "Definí PASSENGER_TEST_BASE_URL para ejecutar contra un servidor mock" };
async function post(resource, payload) {
  const response = await fetch(`${base}/api/data/${resource}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return { status: response.status, body: await response.json() };
}
const people = [{ firstName: "Prueba", lastName: "Uno", document: "30111222" }, { firstName: "Prueba", lastName: "Dos", document: "30111223" }];
const contact = { contactEmail: "qa@test.example", contactPhone: "+54 9 11 5555 5555" };

test("el flujo de compra abre sus pantallas y recursos desde Sprint 1", integration, async () => {
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.provider, "mock", "No ejecutar esta prueba contra datos reales");
  for (const path of ["/pasajero/compra?flight=AR-1420", "/pasajero/pago", "/pasajero/mis-reservas", "/pasajero/facturas", "/api/data/reservations", "/api/data/payments", "/api/data/invoices"]) {
    assert.equal((await fetch(`${base}${path}`)).status, 200, path);
  }
  if (health.sprint === 1) {
    for (const path of ["/mostrador/check-in", "/api/data/check-in", "/api/data/seats", "/pasajero/tickets"]) {
      assert.equal((await fetch(`${base}${path}`)).status, 404, path);
    }
  }
});

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
  const result = await post("reservations", { flightId: "AR-1420", cabin: "Primera", returnFlightId: "AR-1421", returnCabin: "Economy", passengerCount: 2, passengers: people, ...contact });
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
  const booking = { flightId: "AR-1420", cabin: "Economy", passengerCount: 2, passengers: people, ...contact };
  for (const payload of [{ ...booking, returnFlightId: "AR-2231", returnCabin: "Economy" }, { ...booking, cabin: "Otra" }, { ...booking, passengers: [people[0], people[0]] }, { ...booking, returnFlightId: "AR-1421", returnCabin: "Primera", passengerCount: 9, passengers: Array.from({ length: 9 }, (_, index) => ({ ...people[0], document: `3000010${index}` })) }]) {
    assert.equal((await post("reservations", payload)).status, 400);
  }
});

test("exige contacto válido y formato numérico de documento en la reserva", integration, async () => {
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.provider, "mock", "No ejecutar mutaciones en un proveedor real");
  const base = { flightId: "AR-1420", cabin: "Economy", passengerCount: 1, passengers: [people[0]] };
  const sinContacto = await post("reservations", base);
  assert.equal(sinContacto.status, 400);
  assert.match(sinContacto.body.error, /correo electrónico válido/);
  const contactoMal = await post("reservations", { ...base, ...contact, contactEmail: "sin-arroba" });
  assert.equal(contactoMal.status, 400);
  assert.match(contactoMal.body.error, /correo electrónico válido/);
  const documentoMalo = await post("reservations", { ...base, ...contact, passengers: [{ ...people[0], document: "ABC-123" }] });
  assert.equal(documentoMalo.status, 400);
  assert.match(documentoMalo.body.error, /entre 6 y 8 dígitos/);
  const ok = await post("reservations", { ...base, ...contact });
  assert.equal(ok.status, 202);
  assert.ok(ok.body.data.code);
});
