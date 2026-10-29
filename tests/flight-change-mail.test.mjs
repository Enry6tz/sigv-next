import test from "node:test";
import assert from "node:assert/strict";
import { flightChangeMail, changeReason } from "../src/lib/flight-change-mail.ts";

const event = {
  kind: "rescheduled", recipient: "contact@example.test", reservationCode: "SIGV-TEST01", flightCode: "AR-1420",
  origin: "AEP", destination: "COR", passengers: ["Ana Pérez", "Luis Pérez"], reason: null,
  previous: { date: "2026-11-10", departure: "23:30", arrival: "00:40" },
  current: { date: "2026-11-11", departure: "23:50", arrival: "01:00" },
};

test("el correo de cancelación identifica reserva, vuelo y canales de reprogramación y reembolso", () => {
  const mail = flightChangeMail({ ...event, kind: "cancelled" }, { email: "ayuda@example.test", phone: "+54 11 4000 0000" });
  assert.equal(mail.to, "contact@example.test");
  assert.match(mail.subject, /cancelado.*AR-1420/i);
  for (const text of ["SIGV-TEST01", "Ana Pérez", "Luis Pérez", "ayuda@example.test", "+54 11 4000 0000", "reembolso"]) assert.ok(mail.text.includes(text), text);
});

test("el correo de reprogramación conserva ambos itinerarios e identifica llegada al día siguiente", () => {
  const mail = flightChangeMail(event);
  for (const value of ["10/11/2026", "11/11/2026", "12/11/2026", "23:30", "00:40", "23:50", "01:00"]) assert.ok(mail.text.includes(value), value);
  assert.match(mail.text, /anterior/i);
  assert.match(mail.text, /nuevo/i);
});

test("el motivo opcional conserva literalmente texto y saltos, pero no ejecuta HTML", () => {
  const reason = '  Cuestiones climáticas\n<script>alert("x")</script> & revisión  ';
  const mail = flightChangeMail({ ...event, reason });
  assert.ok(mail.text.includes(reason));
  assert.ok(mail.html.includes("&lt;script&gt;"));
  assert.ok(!mail.html.includes("<script>"));
  assert.equal(changeReason(reason), reason);
  assert.equal(changeReason(undefined), "");
  assert.doesNotThrow(() => flightChangeMail(event));
  assert.throws(() => changeReason({}), /texto/i);
  assert.throws(() => changeReason("a".repeat(2001)), /2000/);
});
