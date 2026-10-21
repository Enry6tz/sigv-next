import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type ReceiptFlight = { code: string; origin: string; destination: string; date: string; departure: string; arrival: string };
export type ReceiptPassenger = { id: string; firstName: string; lastName: string; document: string; seat: string | null };
export type ReceiptInvoice = { number: string; amount: number; issuedAt: string; method: string; status: string };
export type ReceiptLeg = {
  reservationCode: string; ownerId: string; status: string; contactEmail: string; cabin: string;
  flight: ReceiptFlight; passengers: ReceiptPassenger[]; invoice: ReceiptInvoice | null;
};

const INK = rgb(0.125, 0.125, 0.125);
const MUTED = rgb(0.4, 0.4, 0.4);
const RULE = rgb(0.8, 0.8, 0.8);
const PAPER = rgb(1, 1, 1);
const MARGIN = 56;

type Sheet = { pdf: PDFDocument; page: PDFPage; regular: PDFFont; bold: PDFFont; y: number; width: number };

// Las fuentes estándar de PDF solo codifican WinAnsi (Latin-1): á, ñ y ¡ funcionan,
// pero otros caracteres harían fallar drawText. Se reemplazan por su letra base o "?".
const LATIN1_FALLBACK: Record<string, string> = {
  "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...",
  "Ł": "L", "ł": "l", "Đ": "D", "đ": "d", "Œ": "OE", "œ": "oe", "ı": "i",
};

export function pdfText(value: string) {
  return value.normalize("NFC").replace(/\p{Zs}/gu, " ").replace(/[^\x20-\x7e\xa0-\xff]/g, (character) => {
    const plain = LATIN1_FALLBACK[character] ?? character.normalize("NFD").replace(/\p{M}/gu, "");
    return /^[\x20-\x7e\xa0-\xff]+$/.test(plain) ? plain : "?";
  });
}

export function flightDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value || "—";
}

function issuedDate(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-AR", { timeZone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

export const receiptMoney = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);

function fit(text: string, font: PDFFont, size: number, maxWidth: number) {
  let result = pdfText(text);
  if (font.widthOfTextAtSize(result, size) <= maxWidth) return result;
  while (result.length > 1 && font.widthOfTextAtSize(`${result}...`, size) > maxWidth) result = result.slice(0, -1);
  return `${result.trimEnd()}...`;
}

async function createSheet(title: string, reference: string): Promise<Sheet> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${title} ${reference}`);
  pdf.setAuthor("SIGV · Aerolínea Nacional");
  pdf.setCreator("SIGV");
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: height - 110, width, height: 110, color: INK });
  page.drawText("SIGV · AEROLÍNEA NACIONAL", { x: MARGIN, y: height - 46, size: 10, font: bold, color: PAPER });
  page.drawText(pdfText(title), { x: MARGIN, y: height - 82, size: 24, font: bold, color: PAPER });
  const label = fit(reference, bold, 14, 240);
  page.drawText(label, { x: width - MARGIN - bold.widthOfTextAtSize(label, 14), y: height - 80, size: 14, font: bold, color: PAPER });
  return { pdf, page, regular, bold, y: height - 150, width };
}

function fields(sheet: Sheet, values: [string, string][]) {
  const column = (sheet.width - MARGIN * 2) / values.length;
  values.forEach(([label, value], index) => {
    const x = MARGIN + index * column;
    sheet.page.drawText(pdfText(label.toUpperCase()), { x, y: sheet.y, size: 8, font: sheet.regular, color: MUTED });
    sheet.page.drawText(fit(value, sheet.bold, 13, column - 12), { x, y: sheet.y - 17, size: 13, font: sheet.bold, color: INK });
  });
  sheet.y -= 48;
}

function rule(sheet: Sheet) {
  sheet.page.drawLine({ start: { x: MARGIN, y: sheet.y + 14 }, end: { x: sheet.width - MARGIN, y: sheet.y + 14 }, thickness: 1, color: RULE });
  sheet.y -= 14;
}

function note(sheet: Sheet, text: string) {
  sheet.page.drawText(fit(text, sheet.regular, 9, sheet.width - MARGIN * 2), { x: MARGIN, y: sheet.y, size: 9, font: sheet.regular, color: MUTED });
  sheet.y -= 14;
}

function route(sheet: Sheet, flight: ReceiptFlight) {
  const { page, bold, regular } = sheet;
  const right = sheet.width - MARGIN;
  page.drawText(pdfText(flight.origin), { x: MARGIN, y: sheet.y - 20, size: 32, font: bold, color: INK });
  const destination = pdfText(flight.destination);
  page.drawText(destination, { x: right - bold.widthOfTextAtSize(destination, 32), y: sheet.y - 20, size: 32, font: bold, color: INK });
  page.drawLine({ start: { x: MARGIN + 110, y: sheet.y - 8 }, end: { x: right - 110, y: sheet.y - 8 }, thickness: 1, color: RULE, dashArray: [4, 4] });
  const flightLabel = fit(`Vuelo ${flight.code}`, regular, 10, right - MARGIN - 240);
  page.drawText(flightLabel, { x: (sheet.width - regular.widthOfTextAtSize(flightLabel, 10)) / 2, y: sheet.y - 2, size: 10, font: regular, color: MUTED });
  page.drawText(pdfText(flight.departure), { x: MARGIN, y: sheet.y - 42, size: 14, font: regular, color: INK });
  const arrival = pdfText(flight.arrival);
  page.drawText(arrival, { x: right - regular.widthOfTextAtSize(arrival, 14), y: sheet.y - 42, size: 14, font: regular, color: INK });
  sheet.y -= 80;
  rule(sheet);
  fields(sheet, [["Fecha", flightDate(flight.date)], ["Salida", flight.departure], ["Llegada", flight.arrival]]);
}

export async function eticketPdf(leg: ReceiptLeg, passenger: ReceiptPassenger) {
  const doc = await createSheet("E-TICKET", leg.reservationCode);
  fields(doc, [["Pasajero", `${passenger.firstName} ${passenger.lastName}`], ["Documento", passenger.document]]);
  rule(doc);
  route(doc, leg.flight);
  fields(doc, [["Código de reserva", leg.reservationCode], ["Clase", leg.cabin], ["Asiento", passenger.seat ?? "Se asigna en el check-in"]]);
  rule(doc);
  note(doc, "Presentá este e-ticket y tu documento de identidad en el mostrador para hacer el check-in.");
  note(doc, "Este documento no es una tarjeta de embarque. Pago de prueba: no se procesó dinero real.");
  return doc.pdf.save();
}

export async function invoicePdf(leg: ReceiptLeg, timeZone = "America/Argentina/Buenos_Aires") {
  if (!leg.invoice) throw new Error(`La reserva ${leg.reservationCode} no tiene factura`);
  const invoice = leg.invoice;
  const doc = await createSheet("FACTURA", invoice.number);
  const { page, bold, regular } = doc;
  fields(doc, [["Fecha de compra", issuedDate(invoice.issuedAt, timeZone)], ["Reserva", leg.reservationCode]]);
  fields(doc, [["Medio de pago", invoice.method], ["Estado del pago", invoice.status]]);
  fields(doc, [["Correo de contacto", leg.contactEmail]]);
  rule(doc);

  const right = doc.width - MARGIN;
  const columns = { quantity: right - 205, unit: right - 170 };
  const header = (text: string, x: number, alignRight = false) =>
    page.drawText(text, { x: alignRight ? x - regular.widthOfTextAtSize(text, 8) : x, y: doc.y, size: 8, font: regular, color: MUTED });
  header("DETALLE", MARGIN);
  header("CANT.", columns.quantity);
  header("PRECIO UNITARIO", columns.unit + 80, true);
  header("IMPORTE", right, true);
  doc.y -= 20;
  const count = Math.max(leg.passengers.length, 1);
  const detail = fit(`Pasaje ${leg.cabin} · ${leg.flight.code} ${leg.flight.origin}-${leg.flight.destination} · ${flightDate(leg.flight.date)}`, regular, 10, columns.quantity - MARGIN - 12);
  page.drawText(detail, { x: MARGIN, y: doc.y, size: 10, font: regular, color: INK });
  page.drawText(String(count), { x: columns.quantity, y: doc.y, size: 10, font: regular, color: INK });
  const unit = pdfText(receiptMoney(invoice.amount / count));
  page.drawText(unit, { x: columns.unit + 80 - regular.widthOfTextAtSize(unit, 10), y: doc.y, size: 10, font: regular, color: INK });
  const amount = pdfText(receiptMoney(invoice.amount));
  page.drawText(amount, { x: right - regular.widthOfTextAtSize(amount, 10), y: doc.y, size: 10, font: regular, color: INK });
  doc.y -= 22;
  for (const person of leg.passengers) {
    page.drawText(fit(`· ${person.firstName} ${person.lastName} · DNI ${person.document}`, regular, 9, columns.quantity - MARGIN - 12), { x: MARGIN + 10, y: doc.y, size: 9, font: regular, color: MUTED });
    doc.y -= 14;
  }
  doc.y -= 16;
  rule(doc);
  const total = pdfText(receiptMoney(invoice.amount));
  page.drawText("TOTAL", { x: MARGIN, y: doc.y - 6, size: 12, font: bold, color: INK });
  page.drawText(total, { x: right - bold.widthOfTextAtSize(total, 18), y: doc.y - 8, size: 18, font: bold, color: INK });
  doc.y -= 50;
  note(doc, "Comprobante de la compra emitido automáticamente tras el pago aprobado.");
  note(doc, "Pago de prueba: no se procesó dinero real.");
  return doc.pdf.save();
}

export type BoardingPass = { code: string; reservationCode: string; passenger: string; document: string; cabin: string; seat: string; flight: ReceiptFlight };

// qr es la matriz de módulos del código (true = negro), sin margen.
export async function boardingPassPdf(pass: BoardingPass, qr: boolean[][]) {
  const doc = await createSheet("TARJETA DE EMBARQUE", pass.code);
  const { page, bold, regular } = doc;
  fields(doc, [["Pasajero", pass.passenger], ["Documento", pass.document]]);
  rule(doc);
  route(doc, pass.flight);
  fields(doc, [["Asiento", pass.seat], ["Clase", pass.cabin], ["Reserva", pass.reservationCode]]);
  rule(doc);
  const label = "CÓDIGO DE EMBARQUE";
  page.drawText(label, { x: (doc.width - regular.widthOfTextAtSize(label, 8)) / 2, y: doc.y, size: 8, font: regular, color: MUTED });
  const cell = 4;
  const quiet = 4;
  const size = (qr.length + quiet * 2) * cell;
  const left = (doc.width - size) / 2;
  const top = doc.y - 10;
  qr.forEach((row, r) => row.forEach((dark, c) => {
    if (dark) page.drawRectangle({ x: left + (c + quiet) * cell, y: top - (r + quiet + 1) * cell, width: cell, height: cell, color: INK });
  }));
  doc.y = top - size - 18;
  const code = pdfText(pass.code);
  page.drawText(code, { x: (doc.width - bold.widthOfTextAtSize(code, 12)) / 2, y: doc.y, size: 12, font: bold, color: INK });
  doc.y -= 30;
  note(doc, "Presentá esta tarjeta y tu documento de identidad en la puerta de embarque.");
  return doc.pdf.save();
}
