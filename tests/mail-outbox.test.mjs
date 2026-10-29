import test from "node:test";
import assert from "node:assert/strict";
import { processMailOutbox, processorSecretMatches } from "../src/lib/mail-outbox.ts";

function store() {
  const items = [{ id: "event-1", claimToken: "lease-1", payload: { recipient: "contact@example.test" }, attempts: 1 }];
  let claimed = false;
  const history = [];
  return {
    history,
    async claim() { if (claimed) return []; claimed = true; return items; },
    async finish(id, token, sent, error) { history.push({ id, token, sent, error }); },
  };
}

test("procesa una notificación en segundo plano y registra su envío sin repetir la misma toma", async () => {
  const queue = store();
  let sent = 0;
  const first = await processMailOutbox(queue, async () => { sent++; return true; });
  const second = await processMailOutbox(queue, async () => { sent++; return true; });
  assert.deepEqual(first, { claimed: 1, sent: 1, retry: 0 });
  assert.deepEqual(second, { claimed: 0, sent: 0, retry: 0 });
  assert.equal(sent, 1);
  assert.equal(queue.history[0].sent, true);
  assert.equal(queue.history[0].token, "lease-1");
});

test("la interrupción SMTP conserva un reintento e historial sin filtrar credenciales", async () => {
  const queue = store();
  const result = await processMailOutbox(queue, async () => { throw new Error("SMTP password=secret"); });
  assert.deepEqual(result, { claimed: 1, sent: 0, retry: 1 });
  assert.equal(queue.history[0].sent, false);
  assert.match(queue.history[0].error, /reintent/i);
  assert.doesNotMatch(queue.history[0].error, /password|secret/);
});

test("SMTP sin configurar no se registra como entregado", async () => {
  const queue = store();
  const result = await processMailOutbox(queue, async () => false);
  assert.equal(result.retry, 1);
  assert.equal(queue.history[0].sent, false);
});

test("dos procesadores que comparten una toma no entregan la misma notificación", async () => {
  const queue = store();
  let sends = 0;
  await Promise.all([processMailOutbox(queue, async () => { sends++; return true; }), processMailOutbox(queue, async () => { sends++; return true; })]);
  assert.equal(sends, 1);
});

test("el procesador automático rechaza secretos ausentes, incorrectos y cabeceras malformadas", () => {
  assert.equal(processorSecretMatches(undefined, "Bearer anything"), false);
  assert.equal(processorSecretMatches("expected-secret", null), false);
  assert.equal(processorSecretMatches("expected-secret", "Bearer wrong"), false);
  assert.equal(processorSecretMatches("expected-secret", "expected-secret"), false);
  assert.equal(processorSecretMatches("expected-secret", "Bearer expected-secret"), true);
});

const base = process.env.PASSENGER_TEST_BASE_URL;
const integration = { skip: !base && "Definí PASSENGER_TEST_BASE_URL para ejecutar contra un servidor mock" };

test("la API de demostración valida el motivo y no afirma persistencia ni entrega SMTP", integration, async () => {
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.provider, "mock", "No ejecutar estas pruebas contra un proveedor real");
  const flight = (await (await fetch(`${base}/api/data/flights`)).json()).data.find((row) => row.id === "AR-1420");
  const later = (value) => { const [hour, minute] = value.split(":").map(Number); const total = (hour * 60 + minute + 30) % 1440; return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; };
  const init = (reason) => ({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ flightId: flight.id, status: "Retrasado", departure: later(flight.departure), arrival: later(flight.arrival), reason }) });
  assert.equal((await fetch(`${base}/api/data/disruptions`, init({ invalid: true }))).status, 400);
  const response = await fetch(`${base}/api/data/disruptions`, init("Cuestiones climáticas\nRevisión <operativa>"));
  assert.equal(response.status, 202);
  const result = await response.json();
  assert.equal(result.persisted, false);
  assert.ok(result.data.acceptedFields.includes("reason"));
  assert.equal(result.data.reason, "Cuestiones climáticas\nRevisión <operativa>");
  const history = await (await fetch(`${base}/api/data/flight-mail`)).json();
  assert.deepEqual(history.data, { configured: false, items: [], attempts: [] });
});

test("el endpoint de procesamiento no permite enviar correo sin autorización", integration, async () => {
  const response = await fetch(`${base}/api/internal/notifications/process`, { method: "POST" });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "No autorizado" });
});
