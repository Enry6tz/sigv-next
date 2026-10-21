import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { eticketPdf, flightDate, invoicePdf, pdfText } from "../src/lib/receipt-pdf.ts";

const passengers = [
  { id: "p1", firstName: "María José", lastName: "Núñez", document: "28741952", seat: null },
  { id: "p2", firstName: "Zoë", lastName: "Łukasiewicz 😀", document: "30111223", seat: "14B" },
];
const leg = {
  reservationCode: "SIGV-1A2B3C4D", ownerId: "u1", status: "Confirmada", contactEmail: "qa@test.example", cabin: "Economy",
  flight: { code: "AR-1420", origin: "EZE", destination: "BRC", date: "2026-09-19", departure: "07:45", arrival: "10:30" },
  passengers,
  invoice: { number: "SIM-ABCDEF1234", amount: 128150, issuedAt: "2026-10-21T22:08:00Z", method: "Tarjeta de prueba", status: "Aprobado (simulado)" },
};

test("las fuentes estándar del PDF reciben solo texto Latin-1", () => {
  assert.equal(pdfText("Núñez ¡Hola!"), "Núñez ¡Hola!");
  assert.equal(pdfText("Erdős →"), "Erdos ?");
  assert.equal(pdfText(`$${String.fromCharCode(0x202f)}64.075`), "$ 64.075");
  assert.equal(pdfText("O’Brien — Łukasz"), "O'Brien - Lukasz");
});

test("muestra la fecha del vuelo sin depender de la zona horaria", () => {
  assert.equal(flightDate("2026-09-19"), "19/09/2026");
  assert.equal(flightDate(""), "—");
});

test("genera un e-ticket en PDF por pasajero, incluso con nombres fuera de Latin-1", async () => {
  for (const passenger of passengers) {
    const bytes = await eticketPdf(leg, passenger);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 1);
    assert.equal(pdf.getTitle(), "E-TICKET SIGV-1A2B3C4D");
  }
});

test("genera la factura en PDF y exige un pago facturado", async () => {
  const many = { ...leg, passengers: Array.from({ length: 9 }, (_, index) => ({ ...passengers[0], id: `p${index}`, document: `3011122${index}` })) };
  const pdf = await PDFDocument.load(await invoicePdf(many));
  assert.equal(pdf.getPageCount(), 1);
  assert.equal(pdf.getTitle(), "FACTURA SIM-ABCDEF1234");
  await assert.rejects(invoicePdf({ ...leg, invoice: null }), /no tiene factura/);
});
