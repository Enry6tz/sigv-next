export type FlightMailItinerary = { date: string; departure: string; arrival: string };
export type FlightChangeMailEvent = {
  kind: "cancelled" | "rescheduled"; recipient: string; reservationCode: string; flightCode: string;
  origin: string; destination: string; passengers: string[]; reason: string | null;
  previous: FlightMailItinerary; current: FlightMailItinerary;
};

export function changeReason(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new Error("El motivo debe ser texto");
  if (value.length > 2000) throw new Error("El motivo no puede superar los 2000 caracteres");
  return value;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);

function itinerary(value: FlightMailItinerary) {
  const date = value.date.slice(0, 10);
  const arrivalDate = value.arrival.slice(0, 5) < value.departure.slice(0, 5)
    ? new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : date;
  const display = (day: string) => day.split("-").reverse().join("/");
  return `Salida ${display(date)} ${value.departure.slice(0, 5)} · Llegada ${display(arrivalDate)} ${value.arrival.slice(0, 5)}`;
}

export function flightChangeMail(event: FlightChangeMailEvent, contact: { email?: string; phone?: string } = {}) {
  const title = event.kind === "cancelled" ? `Vuelo cancelado: ${event.flightCode}` : `Nuevo horario del vuelo ${event.flightCode}`;
  const lines = [
    title, `Reserva: ${event.reservationCode}`, `Ruta: ${event.origin} → ${event.destination}`,
    `Pasajeros: ${event.passengers.join(", ")}`, "",
    `Itinerario anterior: ${itinerary(event.previous)}`,
    ...(event.kind === "rescheduled" ? [`Nuevo itinerario: ${itinerary(event.current)}`] : ["Su vuelo fue cancelado."]),
    ...(event.reason ? ["", "Motivo:", event.reason] : []), "",
    "Para reprogramación o reembolso: sección Mis reservas o mostrador de SIGV.",
    ...(contact.email ? [`Correo de contacto: ${contact.email}`] : []),
    ...(contact.phone ? [`Teléfono de contacto: ${contact.phone}`] : []),
  ];
  const text = lines.join("\n");
  return {
    to: event.recipient, subject: `SIGV · ${title} · ${event.reservationCode}`, text,
    html: `<!doctype html><html lang="es"><body style="font-family:Arial,Helvetica,sans-serif;color:#202020;line-height:1.6"><h1>${escapeHtml(title)}</h1><div style="white-space:pre-wrap">${escapeHtml(lines.slice(1).join("\n"))}</div></body></html>`,
  };
}
