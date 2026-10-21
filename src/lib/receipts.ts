import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { displayFlightCode } from "@/lib/flight-code";
import { mailConfigured, sendMail, type MailAttachment } from "@/lib/mail";
import { appTimeZone, available } from "@/lib/sprint";
import { eticketPdf, flightDate, invoicePdf, receiptMoney, type ReceiptLeg, type ReceiptPassenger } from "@/lib/receipt-pdf";

type Json = Record<string, unknown>;

// PostgREST devuelve objeto o lista según detecte la relación como uno a uno.
function one(value: unknown): Json | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? row as Json : null;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);

function fileSafe(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "pasajero";
}

export async function loadReceipts(client: SupabaseClient, codes: string[]): Promise<ReceiptLeg[]> {
  const { data, error } = await client.from("reservations")
    .select("code,owner_id,status,cabin,contact_email,flight_id,flights(id,schedule_id,origin,destination,flight_date,departure,arrival),reservation_passengers(id,first_name,last_name,document,seat),payments(method,status,invoices(number,amount,issued_at))")
    .in("code", codes);
  if (error) throw error;
  const legs = (data as Json[]).map((row): ReceiptLeg => {
    const flight = one(row.flights);
    const payment = one(row.payments);
    const invoice = one(payment?.invoices);
    return {
      reservationCode: String(row.code), ownerId: String(row.owner_id), status: String(row.status),
      contactEmail: String(row.contact_email ?? ""), cabin: String(row.cabin),
      flight: {
        code: flight ? displayFlightCode({ id: String(flight.id), scheduleId: typeof flight.schedule_id === "string" ? flight.schedule_id : null }) : String(row.flight_id),
        origin: String(flight?.origin ?? "—"), destination: String(flight?.destination ?? "—"),
        date: String(flight?.flight_date ?? ""),
        departure: String(flight?.departure ?? "").slice(0, 5), arrival: String(flight?.arrival ?? "").slice(0, 5),
      },
      passengers: ((row.reservation_passengers ?? []) as Json[]).map((person) => ({
        id: String(person.id), firstName: String(person.first_name), lastName: String(person.last_name),
        document: String(person.document), seat: typeof person.seat === "string" ? person.seat : null,
      })),
      invoice: invoice ? {
        number: String(invoice.number), amount: Number(invoice.amount), issuedAt: String(invoice.issued_at),
        method: String(payment?.method ?? ""), status: String(payment?.status ?? ""),
      } : null,
    };
  });
  return codes.map((code) => legs.find((leg) => leg.reservationCode === code)).filter((leg): leg is ReceiptLeg => Boolean(leg));
}

export function eticketFilename(leg: ReceiptLeg, passenger: ReceiptPassenger) {
  return `E-ticket-${fileSafe(leg.reservationCode)}-${fileSafe(passenger.lastName)}-${fileSafe(passenger.firstName)}.pdf`;
}

export function invoiceFilename(leg: ReceiptLeg) {
  return `Factura-${fileSafe(leg.invoice?.number ?? leg.reservationCode)}.pdf`;
}

export function renderInvoice(leg: ReceiptLeg) {
  return invoicePdf(leg, appTimeZone);
}

// Solo reservas pagadas: sin pago aprobado no se emiten e-tickets ni factura (US-019, criterio 6).
function payable(legs: ReceiptLeg[]) {
  return legs.filter((leg) => leg.status === "Confirmada" && leg.invoice && leg.contactEmail);
}

async function attachments(legs: ReceiptLeg[]) {
  const files: MailAttachment[] = [];
  for (const leg of legs) {
    for (const passenger of leg.passengers)
      files.push({ filename: eticketFilename(leg, passenger), content: await eticketPdf(leg, passenger), contentType: "application/pdf" });
    files.push({ filename: invoiceFilename(leg), content: await renderInvoice(leg), contentType: "application/pdf" });
  }
  return files;
}

function message(legs: ReceiptLeg[]) {
  const codes = legs.map((leg) => leg.reservationCode).join(" y ");
  const total = legs.reduce((sum, leg) => sum + (leg.invoice?.amount ?? 0), 0);
  const describe = (leg: ReceiptLeg) => `Vuelo ${leg.flight.code} · ${leg.flight.origin} → ${leg.flight.destination} · ${flightDate(leg.flight.date)} ${leg.flight.departure} · ${leg.cabin}`;
  const text = [
    "¡Tu reserva está confirmada!", "",
    ...legs.flatMap((leg) => [`Reserva ${leg.reservationCode}`, describe(leg),
      ...leg.passengers.map((person) => `- ${person.firstName} ${person.lastName} (DNI ${person.document})`), ""]),
    `Total pagado: ${receiptMoney(total)}`, "",
    "Adjuntamos un e-ticket en PDF por cada pasajero y la factura de la compra.",
    "Pago de prueba: no se procesó dinero real.",
  ].join("\n");
  const rows = legs.map((leg) => `<tr><td style="padding:12px 0;border-top:1px solid #ddd"><strong>${escapeHtml(leg.reservationCode)}</strong><br>${escapeHtml(describe(leg))}<br><span style="color:#666">${leg.passengers.map((person) => escapeHtml(`${person.firstName} ${person.lastName}`)).join(", ")}</span></td></tr>`).join("");
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#202020"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #ddd"><tr><td style="background:#202020;color:#fff;padding:20px 24px"><strong style="font-size:12px;letter-spacing:1px">SIGV · AEROLÍNEA NACIONAL</strong><h1 style="margin:8px 0 0;font-size:22px">¡Tu reserva está confirmada!</h1></td></tr><tr><td style="padding:8px 24px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr><tr><td style="padding:12px 24px;border-top:2px solid #202020;font-size:16px"><strong>Total pagado: ${escapeHtml(receiptMoney(total))}</strong></td></tr><tr><td style="padding:0 24px 24px;color:#555;font-size:13px;line-height:1.5">Adjuntamos un e-ticket en PDF por cada pasajero y la factura de la compra. Presentá el e-ticket y tu documento en el mostrador para hacer el check-in.<br><br><span style="color:#888">Pago de prueba: no se procesó dinero real.</span></td></tr></table></td></tr></table></body></html>`;
  return { subject: `SIGV · E-ticket y factura de ${legs.length > 1 ? "tus reservas" : "tu reserva"} ${codes}`, text, html };
}

export async function sendReceiptEmail(legs: ReceiptLeg[]) {
  const paid = payable(legs);
  // Ida y vuelta comparten contacto; si difiriera, cada dirección recibe sus tramos.
  const byEmail = new Map<string, ReceiptLeg[]>();
  for (const leg of paid) byEmail.set(leg.contactEmail, [...(byEmail.get(leg.contactEmail) ?? []), leg]);
  for (const [to, group] of byEmail) await sendMail({ to, ...message(group), attachments: await attachments(group) });
  return [...byEmail.keys()];
}

// US-019: envía los comprobantes después de responder, para que una falla del correo
// no demore ni revierta un pago ya confirmado. Devuelve el destinatario previsto.
export async function scheduleReceiptEmail(client: SupabaseClient, codes: string[]) {
  if (!available(2) || !mailConfigured()) return null;
  try {
    const legs = payable(await loadReceipts(client, codes));
    if (!legs.length) return null;
    after(() => sendReceiptEmail(legs).catch((error) => console.error("Receipt email failed", error)));
    return legs[0].contactEmail;
  } catch (error) {
    console.error("Receipt email skipped", error);
    return null;
  }
}
