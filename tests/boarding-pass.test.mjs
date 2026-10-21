import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { boardingPassCode, boardingPassPayload, qrMatrix } from "../src/lib/boarding-pass.ts";
import { boardingPassPdf } from "../src/lib/receipt-pdf.ts";

const pass = {
  code: boardingPassCode("8f3a2c1d-4b5e-4f60-9a7b-123456789abc"), reservationCode: "SIGV-1A2B3C4D",
  passenger: "María José Núñez", document: "28741952", cabin: "Economy", seat: "14B",
  flight: { code: "AR-1420", origin: "EZE", destination: "BRC", date: "2026-09-19", departure: "07:45", arrival: "10:30" },
};

test("el código del pase coincide con el que devuelve sigv_check_in", () => {
  assert.equal(pass.code, "BP-8F3A2C1D4B");
});

test("el QR identifica el pase, la reserva, el vuelo, la fecha y el asiento", () => {
  const payload = boardingPassPayload({ code: pass.code, reservationCode: pass.reservationCode, flightCode: pass.flight.code, date: pass.flight.date, seat: pass.seat });
  assert.equal(payload, "SIGV|BP-8F3A2C1D4B|SIGV-1A2B3C4D|AR-1420|2026-09-19|14B");
  const matrix = qrMatrix(payload);
  assert.ok(matrix.length >= 21 && (matrix.length - 17) % 4 === 0, "tamaño de una versión QR válida");
  assert.ok(matrix.every((row) => row.length === matrix.length));
  // Patrón de posición de la esquina superior izquierda: borde negro de 7 módulos.
  assert.deepEqual(matrix[0].slice(0, 7), Array(7).fill(true));
});

test("genera la tarjeta de embarque en PDF con el QR", async () => {
  const qr = qrMatrix(boardingPassPayload({ code: pass.code, reservationCode: pass.reservationCode, flightCode: pass.flight.code, date: pass.flight.date, seat: pass.seat }));
  const pdf = await PDFDocument.load(await boardingPassPdf(pass, qr));
  assert.equal(pdf.getPageCount(), 1);
  assert.equal(pdf.getTitle(), "TARJETA DE EMBARQUE BP-8F3A2C1D4B");
});
