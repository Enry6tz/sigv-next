import test from "node:test";
import assert from "node:assert/strict";
import { simulatedPaymentResult, DECLINED_TEST_CARD } from "../src/lib/payment-simulation.ts";
import { cardFormProblem } from "../src/lib/checkout-validation.ts";

const card = { cardNumber: "4000 0000 0000 0002", cardHolder: "Demo Passenger", cardExpiry: "12/99", cardCvv: "123" };
test("US-035: tarjeta documentada tiene formato válido y rechazo determinista", () => {
  assert.equal(DECLINED_TEST_CARD, "4000000000000002");
  assert.equal(cardFormProblem(card), null);
  assert.deepEqual(simulatedPaymentResult(card.cardNumber), { status: "RECHAZADO", approved: false });
  assert.equal(simulatedPaymentResult(DECLINED_TEST_CARD).approved, false);
});
test("US-035: tarjetas de aprobación y transferencia conservan el comportamiento anterior", () => {
  assert.deepEqual(simulatedPaymentResult("4111111111111111"), { status: "Aprobado (simulado)", approved: true });
  assert.equal(simulatedPaymentResult(undefined).approved, true);
});

const base = process.env.PASSENGER_TEST_BASE_URL;
test("US-035: API rechaza sin comprobantes y permite luego un pago de prueba aprobado", { skip: !base && "Requiere servidor mock" }, async () => {
  assert.equal((await (await fetch(`${base}/api/health`)).json()).provider, "mock");
  const pay = (payload) => fetch(`${base}/api/data/payments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const response = await pay({ reservationCode: "DEMO-REJECT", method: "Tarjeta de prueba", ...card });
  const result = await response.json();
  assert.equal(response.status, 402);
  assert.equal(result.code, "PAYMENT_DECLINED");
  assert.equal(result.data.status, "RECHAZADO");
  assert.equal(result.data.invoice, undefined);
  assert.equal(result.data.receiptEmail, undefined);
  const approved = await pay({ reservationCode: "DEMO-REJECT", method: "Tarjeta de prueba", ...card, cardNumber: "4111111111111111" });
  assert.equal(approved.status, 202);
  assert.ok((await approved.json()).data.invoice);
});
