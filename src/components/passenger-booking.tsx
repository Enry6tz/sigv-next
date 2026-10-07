"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { Flight } from "@/lib/mock-data";
import { displayFlightCode } from "@/lib/flight-code";
import { cabinAvailable, parsePassengerCount, validReturnFlight, type Cabin } from "@/lib/passenger-search";
import { mutate } from "@/lib/mutations";

export type BookingQuery = { passengers?: string; cabin?: string; returnFlight?: string; returnCabin?: string };
type ReservationResult = { code: string; flightId: string; cabin: string; seats: number; status: string; returnReservation?: Omit<ReservationResult, "returnReservation"> };
const money = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);

export function PassengerBooking({ initialFlight, initialQuery, live }: { initialFlight?: string; initialQuery: BookingQuery; live: boolean }) {
  const [flights, setFlights] = useState<Flight[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReservationResult | null>(null);
  const count = parsePassengerCount(initialQuery.passengers);
  const cabin: Cabin = initialQuery.cabin === "Primera" ? "Primera" : "Economy";
  const returnCabin: Cabin = initialQuery.returnCabin === "Primera" ? "Primera" : "Economy";
  const outbound = flights?.find((flight) => flight.id === initialFlight);
  const returning = flights?.find((flight) => flight.id === initialQuery.returnFlight);
  const roundTrip = Boolean(initialQuery.returnFlight);
  const available = Boolean(outbound && cabinAvailable(outbound, cabin, count) && (!roundTrip || returning && validReturnFlight(outbound, returning) && cabinAvailable(returning, returnCabin, count)));
  const fare = (flight: Flight | undefined, selectedCabin: Cabin) => (selectedCabin === "Economy" ? flight?.economy : flight?.first) ?? 0;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/data/flights", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo cargar la selección.");
      setFlights(result.data);
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !available || result) return;
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const passengers = Array.from({ length: count }, (_, index) => ({ firstName: String(form.get(`firstName${index}`) || "").trim(), lastName: String(form.get(`lastName${index}`) || "").trim(), document: String(form.get(`document${index}`) || "").trim() }));
    if (new Set(passengers.map((person) => person.document.toLowerCase())).size !== count) { setError("Cada pasajero debe tener un documento diferente."); setBusy(false); return; }
    const response = await mutate("reservations", "POST", { flightId: initialFlight, cabin, passengerCount: count, passengers, ...(roundTrip ? { returnFlightId: initialQuery.returnFlight, returnCabin } : {}) });
    if (response.ok) setResult(response.data); else setError(response.error);
    setBusy(false);
  }

  const paymentQuery = new URLSearchParams({ reservation: result?.code || "" });
  if (result?.returnReservation) paymentQuery.set("returnReservation", result.returnReservation.code);
  return <div className="two-column"><section className="panel"><p className="kicker">PASO 1 DE 2</p><h2>Datos de los pasajeros</h2>
    {!flights && !error && <p role="status">Cargando tu selección…</p>}
    {flights && !available && !result && <p role="alert" className="error-text">La selección ya no está disponible para tu grupo. Volvé a buscar vuelos.</p>}
    <form className="stack-form" onSubmit={submit}><fieldset disabled={busy || !available || Boolean(result)} className="passenger-booking-fields"><legend>{count} {count === 1 ? "pasajero" : "pasajeros"}{roundTrip ? " · Ida y vuelta" : " · Solo ida"}</legend>
      {Array.from({ length: count }, (_, index) => <fieldset key={index}><legend>Pasajero {index + 1}</legend><div className="form-row"><label>Nombre<input name={`firstName${index}`} required autoComplete="given-name" /></label><label>Apellido<input name={`lastName${index}`} required autoComplete="family-name" /></label></div><label>DNI / documento<input name={`document${index}`} required /></label></fieldset>)}
      <button className="button dark" type="submit" disabled={busy || !available || Boolean(result)}>{busy ? "Reservando…" : "Continuar con la reserva"}</button>
    </fieldset></form>
    {error && <p role="alert" className="error-text">{error}</p>}
    {result && <div className="success-box" role="status"><strong>{live ? "Reserva creada" : "Reserva simulada"}: {result.code}</strong>{result.returnReservation && <p>Vuelta: {result.returnReservation.code}</p>}<p>{result.seats} {result.seats === 1 ? "pasajero" : "pasajeros"} · Ida {result.cabin}{result.returnReservation && ` · Vuelta ${result.returnReservation.cabin}`}.</p><Link className="button dark small" href={`/pasajero/pago?${paymentQuery}`}>Ir al pago de prueba →</Link></div>}
    <div className="action-row"><Link href="/pasajero/buscar-vuelos" className="inline-action">Volver al buscador</Link></div>
  </section><aside className="panel summary-panel"><p className="kicker">TU SELECCIÓN</p>{[{ flight: outbound, cabin, label: "Ida" }, ...(roundTrip ? [{ flight: returning, cabin: returnCabin, label: "Vuelta" }] : [])].map((leg) => <div key={leg.label} className="passenger-booking-leg"><p className="kicker">{leg.label} · {leg.cabin === "Primera" ? "Primera clase" : leg.cabin}</p><h2>{leg.flight ? `${leg.flight.origin} → ${leg.flight.destination}` : "Cargando vuelo…"}</h2>{leg.flight && <><p>{displayFlightCode(leg.flight)} · {new Date(`${leg.flight.date}T12:00:00`).toLocaleDateString("es-AR")} · {leg.flight.departure} → {leg.flight.arrival}</p><p>{money(fare(leg.flight, leg.cabin))} por persona</p></>}</div>)}<div className="summary-total"><span>Total · {count} {count === 1 ? "pasajero" : "pasajeros"}</span><strong>{money((fare(outbound, cabin) + (roundTrip ? fare(returning, returnCabin) : 0)) * count)}</strong></div><p className="form-hint">La disponibilidad y el precio se confirman al crear la reserva.</p></aside></div>;
}
