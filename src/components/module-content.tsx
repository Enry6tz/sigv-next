"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { findModule, type Module } from "@/lib/catalog";
import { PassengerBooking, type BookingQuery } from "./passenger-booking";
import { DomainManager } from "./domain-manager";
import { AdminFlights } from "./admin-flights";
import { ActionNotice, type Notice } from "./action-notice";
import { mutate } from "@/lib/mutations";
import { createClient } from "@/lib/supabase/client";
import { mapAuthError } from "@/lib/auth-errors";
import { documentProblem, emailProblem, normalizeDocument, normalizeEmail, normalizePhone, phoneProblem } from "@/lib/identity-validation";
import {
  cardNumberProblem,
  cardHolderProblem,
  cardExpiryProblem,
  cardCvvProblem,
  formatCardExpiry,
  groupCardNumber,
  normalizeCardCvv,
  normalizeCardNumber,
} from "@/lib/checkout-validation";


const money = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);

function downloadFile(filename: string, contents: string, mime: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function useMock<T>(resource: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    fetch(`/api/data/${resource}`, { cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Error al cargar");
      if (active) { setData(result.data); setError(""); }
    }).catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [resource, revision]);
  return { data, error, refresh: () => setRevision((value) => value + 1) };
}

function Status({ value }: { value: string }) {
  return <span className={`status ${value === "Cancelado" ? "danger" : value === "Retrasado" ? "warning" : "ok"}`}><span aria-hidden="true">●</span>{value}</span>;
}

function Payment({ reservationCode, returnReservation, live }: { reservationCode: string; returnReservation?: string; live: boolean }) {
  const [message, setMessage] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cnErr, setCnErr] = useState("");
  const [chErr, setChErr] = useState("");
  const [ceErr, setCeErr] = useState("");
  const [ccErr, setCcErr] = useState("");
  const router = useRouter();

  function onCardNumberChange(event: ChangeEvent<HTMLInputElement>) {
    setCardNumber(groupCardNumber(event.target.value));
    setCnErr("");
  }

  function onCardExpiryChange(event: ChangeEvent<HTMLInputElement>) {
    setCardExpiry(formatCardExpiry(event.target.value));
    setCeErr("");
  }

  function onCardCvvChange(event: ChangeEvent<HTMLInputElement>) {
    setCardCvv(normalizeCardCvv(event.target.value));
    setCcErr("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || paid) return;

    const problems = {
      cardNumber: cardNumberProblem(cardNumber),
      cardHolder: cardHolderProblem(cardHolder),
      cardExpiry: cardExpiryProblem(cardExpiry),
      cardCvv: cardCvvProblem(cardCvv),
    };

    setCnErr(problems.cardNumber ?? "");
    setChErr(problems.cardHolder ?? "");
    setCeErr(problems.cardExpiry ?? "");
    setCcErr(problems.cardCvv ?? "");

    if (Object.values(problems).some((problem) => Boolean(problem))) return;

    setBusy(true);
    setMessage(null);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (returnReservation) data.returnReservationCode = returnReservation;
    data.cardNumber = normalizeCardNumber(cardNumber);
    data.cardHolder = cardHolder.trim();
    data.cardExpiry = cardExpiry;
    data.cardCvv = normalizeCardCvv(cardCvv);

    const result = await mutate("payments", "POST", data);
    setBusy(false);

    if (result.ok) {
      setPaid(true);
      setConfirmed(true);
      const confirmationQuery = new URLSearchParams({ reservation: reservationCode, ...(returnReservation ? { returnReservation } : {}) });
      router.push(`/pasajero/pago?${confirmationQuery.toString()}&confirmed=1`);
    } else {
      setMessage({ ok: false, text: result.error });
    }
  }

  if (confirmed) {
    return (
      <div className="two-column">
        <section className="panel">
          <p className="kicker">PASO 2 DE 2</p>
          <h2>¡Reserva Confirmada!</h2>
          <p>Tu pasaje fue emitido exitosamente.</p>
          <div className="record-grid">
            <div><strong>Número de Reserva</strong><span>{reservationCode}</span></div>
            {returnReservation && <div><strong>Reserva de Vuelta</strong><span>{returnReservation}</span></div>}
            <div><strong>Estado</strong><span>Pagado</span></div>
          </div>
          <div className="action-row">
            <button className="button dark" disabled={!live}>Descargar Boarding Pass</button>
            <Link className="button small" href="/pasajero/mis-reservas">Ver mis reservas</Link>
          </div>
        </section>
        <aside className="panel summary-panel">
          <h2>Resumen del pago</h2>
          <p>El pago se procesó correctamente y tu reserva está confirmada.</p>
          <p className="form-hint">No se procesó dinero real. Esta es una simulación de prueba.</p>
        </aside>
      </div>
    );
  }

  return (
    <div className="two-column">
      <section className="panel">
        <p className="kicker">PASO 2 DE 2</p>
        <h2>Datos de Pago</h2>
        <form className="stack-form" onSubmit={submit}>
          <label>Código de reserva<span className="muted"> (no se modifica)</span>
            <input name="reservationCode" defaultValue={reservationCode} readOnly required />
          </label>
          {returnReservation && (
            <label>Código de reserva de vuelta<span className="muted"> (no se modifica)</span>
              <input name="returnReservationCode" defaultValue={returnReservation} readOnly required />
            </label>
          )}
          <div className="form-row card-brand-pills">
            <button type="button" role="radio" aria-checked="true">VISA</button>
            <button type="button" role="radio" aria-checked="false">MC</button>
            <button type="button" role="radio" aria-checked="false">AMEX</button>
            <button type="button" role="radio" aria-checked="false">DEBIT</button>
          </div>
          <label>NÚMERO DE TARJETA
            <input name="cardNumber" inputMode="numeric" autoComplete="cc-number" maxLength={19} value={cardNumber} onChange={onCardNumberChange} required />
            {cnErr && <span className="field-error">{cnErr}</span>}
          </label>
          <label>NOMBRE EN LA TARJETA
            <input name="cardHolder" autoComplete="cc-name" value={cardHolder} onChange={(event) => { setCardHolder(event.target.value); setChErr(""); }} required />
            {chErr && <span className="field-error">{chErr}</span>}
          </label>
          <div className="form-row">
            <label>VENCIMIENTO (MM/AA)
              <input name="cardExpiry" inputMode="numeric" autoComplete="cc-exp" maxLength={5} value={cardExpiry} onChange={onCardExpiryChange} required />
              {ceErr && <span className="field-error">{ceErr}</span>}
            </label>
            <label>CÓDIGO DE SEGURIDAD (CVV)
              <input name="cardCvv" inputMode="numeric" autoComplete="cc-csc" maxLength={4} value={cardCvv} onChange={onCardCvvChange} required />
              {ccErr && <span className="field-error">{ccErr}</span>}
            </label>
          </div>
          <label>CUOTAS
            <input name="installments" defaultValue="1 cuota sin interés" readOnly />
          </label>
          <p className="form-hint"><span aria-hidden="true">🔒</span> Tu información de pago está cifrada con tecnología SSL de 256 bits. SIGV nunca almacena el número completo de tu tarjeta.</p>
          <button className="button dark" disabled={busy || paid}>{busy ? "Procesando…" : "Confirmar y Pagar"}</button>
        </form>
        {message && <ActionNotice notice={message} />}
      </section>
      <aside className="panel summary-panel">
        <h2>Resumen de compra</h2>
        <p>Reserva {reservationCode}{returnReservation && ` + Vuelta {returnReservation}`}</p>
        <p className="form-hint">Al continuar aceptás los Términos y Condiciones de SIGV Aerolínea Nacional.</p>
        <p className="form-hint">Usá el botón Confirmar y Pagar para finalizar.</p>
      </aside>
    </div>
  );
}

type CheckInReservation = { code: string; flightId: string; cabin: string; passenger: string; document: string; seat: string | null; checkedIn: boolean };

function CheckIn({ live }: { live: boolean }) {
  const [message, setMessage] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [reservation, setReservation] = useState<CheckInReservation | null>(null);
  const [seats, setSeats] = useState<{ code: string; cabin: string; status: string }[] | null>(null);
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null);
  const [baggageKg, setBaggageKg] = useState("0");
  const [reservationCode, setReservationCode] = useState("");
  const [document, setDocument] = useState("");

  async function lookupReservation() {
    if (!reservationCode || !document) return;
    setBusy(true); setMessage(null); setReservation(null); setSeats(null); setSelectedSeat(null);
    try {
      const response = await fetch("/api/data/manifest", { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo buscar la reserva.");
      const body = await response.json();
      const rows = (body.data ?? []) as ManifestRow[];
      const row = rows.find((r) => r.reservationCode === reservationCode && r.document === document);
      if (!row) throw new Error("Reserva no encontrada.");
      if (row.checkedIn) throw new Error("El pasajero ya tiene check-in.");

      // Obtener cabina de la reserva
      const resResponse = await fetch("/api/data/reservations", { cache: "no-store" });
      if (!resResponse.ok) throw new Error("No se pudo obtener el detalle de la reserva.");
      const resBody = await resResponse.json();
      const resRows = (resBody.data ?? []) as { code: string; cabin: string }[];
      const resRow = resRows.find((r) => r.code === reservationCode);
      const cabin = resRow?.cabin ?? "Economy";

      setReservation({
        code: row.reservationCode,
        flightId: row.flightId,
        cabin,
        passenger: row.passenger,
        document: row.document,
        seat: row.seat ?? null,
        checkedIn: row.checkedIn,
      });

      const seatsResponse = await fetch(`/api/data/seats?flightId=${encodeURIComponent(row.flightId)}`, { cache: "no-store" });
      if (!seatsResponse.ok) throw new Error("No se pudieron cargar los asientos.");
      const seatsBody = await seatsResponse.json();
      setSeats((seatsBody.data ?? []) as { code: string; cabin: string; status: string }[]);
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Error al buscar la reserva." });
    } finally {
      setBusy(false);
    }
  }

  async function submitCheckIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !reservation || !selectedSeat) return;
    setBusy(true); setMessage(null);
    const result = await mutate("check-in", "POST", {
      reservationCode: reservation.code,
      document: reservation.document,
      seat: selectedSeat,
      baggageKg: Number(baggageKg),
    });
    setBusy(false);
    if (result.ok) {
      setMessage({ ok: true, text: `Check-in ${live ? "registrado" : "simulado"} · asiento ${result.data.seat} · pase ${result.data.boardingPass}` });
      setSelectedSeat(null);
    } else {
      setMessage({ ok: false, text: result.error });
    }
  }

  const cabinSeats = (seats || []).filter((s) => s.cabin === reservation?.cabin);
  const availableSeats = cabinSeats.filter((s) => s.status === "Disponible");

  return (
    <div className="two-column">
      <section className="panel">
        <p className="kicker">ATENCIÓN PRESENCIAL</p>
        <h2>Registrar check-in</h2>
        {!reservation ? (
          <form className="stack-form" onSubmit={(e) => { e.preventDefault(); lookupReservation(); }}>
            <label>Código de reserva<input name="reservationCode" value={reservationCode} onChange={(e) => setReservationCode(e.target.value)} placeholder="SIGV-..." required /></label>
            {live && <label>Documento del pasajero<input name="document" value={document} onChange={(e) => setDocument(e.target.value)} placeholder="DNI del pasajero" required /></label>}
            <button className="button dark" disabled={busy || !reservationCode || !document}>{busy ? "Buscando…" : "Buscar reserva"}</button>
          </form>
        ) : (
          <>
            <div style={{ marginBottom: 16, padding: 16, background: "#eef7f0", borderLeft: "3px solid #286345" }}>
              <p style={{ margin: 0, fontSize: "12px", fontWeight: "700" }}>{reservation.passenger}</p>
              <p style={{ margin: 4, fontSize: "11px", color: "#777" }}>{reservation.code} · {reservation.flightId} · Clase {reservation.cabin}</p>
            </div>
            <p className="form-hint">Seleccioná un asiento disponible en el mapa. Los asientos ocupados o bloqueados no se pueden elegir.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 28px)", gap: "4px", marginBottom: "12px" }}>
              {cabinSeats.map((s) => {
                const isAvailable = s.status === "Disponible";
                const isSelected = selectedSeat === s.code;
                const disabled = s.status !== "Disponible";
                return (
                  <button
                    key={s.code}
                    type="button"
                    disabled={disabled}
                    onClick={!disabled ? () => setSelectedSeat(s.code) : undefined}
                    style={{
                      width: "28px", height: "28px",
                      background: isSelected ? "#222" : isAvailable ? "#286345" : s.status === "Ocupado" ? "#a23434" : "#ddd",
                      color: isSelected || isAvailable ? "#fff" : "#222",
                      border: "none", borderRadius: "2px", cursor: disabled ? "not-allowed" : "pointer",
                      fontSize: "10px", fontWeight: "700",
                    }}
                    title={`${s.code} · ${s.status}`}
                  >
                    {s.code}
                  </button>
                );
              })}
            </div>
            <div style={{ marginBottom: "16px", fontSize: "11px" }}>
              <span style={{ marginRight: "12px" }}><span style={{ width: "12px", height: "12px", background: "#286345", display: "inline-block", marginRight: "4px" }} />Disponible</span>
              <span style={{ marginRight: "12px" }}><span style={{ width: "12px", height: "12px", background: "#a23434", display: "inline-block", marginRight: "4px" }} />Ocupado</span>
              <span style={{ marginRight: "12px" }}><span style={{ width: "12px", height: "12px", background: "#ddd", display: "inline-block", marginRight: "4px" }} />Bloqueado</span>
              <span><span style={{ width: "12px", height: "12px", background: "#222", display: "inline-block", marginRight: "4px" }} />Seleccionado</span>
            </div>
            <p>{availableSeats.length} asiento{availableSeats.length !== 1 ? "s" : ""} disponible{availableSeats.length !== 1 ? "s" : ""} de {cabinSeats.length} en cabina {reservation.cabin}</p>
            <form className="stack-form" onSubmit={submitCheckIn}>
              <label>Asiento<input name="seat" value={selectedSeat ?? ""} readOnly required /></label>
              <label>Equipaje en bodega (kg)<input type="number" name="baggageKg" min="0" max="40" step="0.1" value={baggageKg} onChange={(e) => setBaggageKg(e.target.value)} required /></label>
              <button className="button dark" disabled={busy || !selectedSeat}>{busy ? "Registrando…" : "Registrar check-in"}</button>
              <button type="button" className="button" onClick={() => { setReservation(null); setSeats(null); setSelectedSeat(null); setReservationCode(""); setDocument(""); }}>Otra reserva</button>
            </form>
          </>
        )}
        {message && <ActionNotice notice={message} />}
      </section>
      <aside className="panel summary-panel"><h2>Verificación de mostrador</h2><p>{live ? "La reserva, el documento, la cabina, la disponibilidad del asiento y el equipaje se comprueban en Supabase antes de registrar el pase." : "Datos de prueba para recorrer el proceso."}</p></aside>
    </div>
  );
}

type ManifestRow = { reservationCode: string; flightId: string; passenger: string; document: string; seat: string | null; baggageKg: number | null; checkedIn: boolean; status: string; boardingPass: string | null };

function Manifest() {
  const [flights, setFlights] = useState<{ id: string; origin: string; destination: string; flight_date: string }[] | null>(null);
  const [manifest, setManifest] = useState<ManifestRow[] | null>(null);
  const [error, setError] = useState("");
  const [selectedFlight, setSelectedFlight] = useState("");
  const [search, setSearch] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/data/flights", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.json().then((b) => b.error ?? "No se pudieron cargar los vuelos."));
        const body = await response.json();
        setFlights((body.data ?? []) as { id: string; origin: string; destination: string; flight_date: string }[]);
      })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedFlight) return;
    const controller = new AbortController();
    fetch("/api/data/manifest", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.json().then((b) => b.error ?? "No se pudo cargar el manifiesto."));
        const body = await response.json();
        setManifest((body.data ?? []) as ManifestRow[]);
      })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [selectedFlight, revision]);

  const flight = flights?.find((f) => f.id === selectedFlight);
  const rows = (manifest || []).filter((row) => {
    if (row.flightId !== selectedFlight) return false;
    const q = search.toLowerCase();
    return row.passenger.toLowerCase().includes(q) || row.document.toLowerCase().includes(q) || row.reservationCode.toLowerCase().includes(q);
  });

  return <section className="panel">
    <div className="panel-title"><div><p className="kicker">MOSTRADOR / MANIFIESTO</p><h2>Manifiesto de pasajeros</h2></div></div>
    {error && <p role="alert" className="error-text">{error}</p>}
    {!flights && <p role="status">Cargando vuelos…</p>}
    {flights && !selectedFlight && <div className="form-row"><label>Vuelo<select onChange={(event) => { setSelectedFlight(event.target.value); setSearch(""); }}><option value="">Seleccioná un vuelo</option>{flights.map((f) => <option key={f.id} value={f.id}>{f.id} · ${f.origin} → ${f.destination} (${new Date(f.flight_date).toLocaleDateString("es-AR")})</option>)}</select></label></div>}
    {selectedFlight && (
      <>
        <div className="form-row" style={{ marginBottom: 16 }}>
          <label>Buscar por DNI, nombre o reserva<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="DNI, apellido o código de reserva…" /></label>
          <button className="button small" type="button" onClick={() => void setRevision((v) => v + 1)}>Actualizar</button>
        </div>
        {flight && <div style={{ marginBottom: 12, color: "#777", fontSize: "12px" }}>{flight.origin} → ${flight.destination} · ${new Date(flight.flight_date).toLocaleDateString("es-AR")} · ${rows.length} pasajero${rows.length !== 1 ? "s" : ""} confirmado${rows.length !== 1 ? "s" : ""}</div>}
        {rows.length === 0 ? <div className="empty-inline">No hay pasajeros confirmados para este vuelo con los criterios de búsqueda.</div> : (
          <div className="record-grid">
            {rows.map((row) => (
              <article className="record-card" key={`${row.reservationCode}-${row.document}`}>
                <strong>{row.reservationCode}</strong>
                <p>{row.passenger}</p>
                <p>Documento: {row.document}</p>
                <p>Asiento: {row.seat ?? "—"} · Equipaje: {row.baggageKg ?? "—"} kg</p>
                <p><Status value={row.checkedIn ? "Completado" : "Pendiente"} /></p>
              </article>
            ))}
          </div>
        )}
      </>
    )}
  </section>;
}

type EditableRow = Record<string, string | number | null>;

type BoardingPassRow = { reservationCode: string; flightId: string; passenger: string; document: string; seat: string | null; baggageKg: number | null; checkedIn: boolean; status: string; boardingPass: string | null };

function BoardingPass() {
  const [passes, setPasses] = useState<BoardingPassRow[] | null>(null);
  const [flights, setFlights] = useState<{ id: string; origin: string; destination: string; flight_date: string; departure: string; arrival: string }[] | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<BoardingPassRow & { origin: string; destination: string; flight_date: string; departure: string; arrival: string } | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/data/boarding-passes", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.json().then((b) => b.error ?? "No se pudo cargar el listado de pases."));
        const body = await response.json();
        setPasses((body.data ?? []) as BoardingPassRow[]);
      })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [revision]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/data/flights", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.json().then((b) => b.error ?? "No se pudieron cargar los vuelos."));
        const body = await response.json();
        setFlights((body.data ?? []) as { id: string; origin: string; destination: string; flight_date: string; departure: string; arrival: string }[]);
      })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, []);

  function qrMatrix(code: string, size: number) {
    let hash = 0;
    for (let i = 0; i < code.length; i++) hash = ((hash << 5) - hash + code.charCodeAt(i)) | 0;
    const cells: boolean[][] = [];
    for (let r = 0; r < size; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < size; c++) {
        hash = ((hash << 13) ^ (hash >> 17)) | 0;
        row.push(((hash >> (c % 5)) & 1) === 1);
      }
      cells.push(row);
    }
    return cells;
  }

  if (selected) {
    const flight = flights?.find((f) => f.id === selected.flightId);
    const cells = qrMatrix(selected.boardingPass ?? selected.reservationCode, 21);
    return (
      <section className="panel" style={{ maxWidth: "700px", margin: "0 auto" }}>
        <div className="panel-title"><div><p className="kicker">TARJETA DE EMBARQUE</p><h2>Boarding Pass</h2></div><button className="button small" onClick={() => setSelected(null)}>Volver al listado</button></div>
        <div style={{ border: "2px solid #222", padding: "24px", background: "#fff", fontFamily: "Consolas, monospace" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div>
              <p style={{ margin: 0, fontSize: "11px", color: "#777", textTransform: "uppercase" }}>SIGV · Aerolínea Nacional</p>
              <p style={{ margin: 0, fontSize: "24px", fontWeight: "700" }}>Tarjeta de Embarque</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ margin: 0, fontSize: "11px", fontWeight: "700" }}>{selected.boardingPass}</p>
            </div>
          </div>
          <div style={{ borderBottom: "1px solid #ddd", paddingBottom: "16px", marginBottom: "16px" }}>
            <p style={{ margin: 0, fontSize: "10px", color: "#777", textTransform: "uppercase" }}>Vuelo</p>
            <p style={{ margin: 0, fontSize: "16px", fontWeight: "700" }}>{flight ? `${flight.origin} → ${flight.destination}` : selected.flightId}</p>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#555" }}>{flight ? `${new Date(flight.flight_date).toLocaleDateString("es-AR")} · ${flight.departure} → ${flight.arrival}` : ""}</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
            <div>
              <p style={{ margin: 0, fontSize: "10px", color: "#777", textTransform: "uppercase" }}>Pasajero</p>
              <p style={{ margin: 0, fontSize: "14px", fontWeight: "700" }}>{selected.passenger}</p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: "10px", color: "#777", textTransform: "uppercase" }}>Documento</p>
              <p style={{ margin: 0, fontSize: "14px", fontWeight: "700" }}>{selected.document}</p>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div>
              <p style={{ margin: 0, fontSize: "10px", color: "#777", textTransform: "uppercase" }}>Asiento</p>
              <p style={{ margin: 0, fontSize: "20px", fontWeight: "700" }}>{selected.seat}</p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: "10px", color: "#777", textTransform: "uppercase" }}>Reserva</p>
              <p style={{ margin: 0, fontSize: "14px", fontWeight: "700" }}>{selected.reservationCode}</p>
            </div>
          </div>
          <div style={{ marginTop: "24px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <p style={{ margin: 0, fontSize: "10px", color: "#777", textTransform: "uppercase", marginBottom: "8px" }}>Código QR de embarque</p>
            <div style={{ display: "grid", gap: "2px" }}>
              {cells.map((row, r) => (
                <div key={r} style={{ display: "flex", gap: "2px" }}>
                  {row.map((cell, c) => (
                    <div key={c} style={{ width: "12px", height: "12px", background: cell ? "#222" : "#eee" }} />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: "24px", textAlign: "center" }}>
            <button className="button dark" onClick={() => window.print()}>Imprimir Tarjeta de Embarque</button>
          </div>
          <p style={{ marginTop: "16px", fontSize: "11px", color: "#777" }}>Presenta esta tarjeta en la puerta de embarque junto con tu documento de identidad.</p>
        </div>
      </section>
    );
  }

  if (error) return <section className="panel"><p role="alert" className="error-text">{error}</p></section>;
  if (!passes) return <section className="panel"><p role="status">Cargando pases de embarque…</p></section>;

  const passList = passes.filter((p) => p.checkedIn && p.boardingPass);

  return (
    <section className="panel">
      <div className="panel-title"><div><p className="kicker">MOSTRADOR / BOARDING PASS</p><h2>Pases de embarque</h2></div><button className="button small" type="button" onClick={() => void setRevision((v) => v + 1)}>Actualizar</button></div>
      {passList.length === 0 ? (
        <div className="empty-inline">No hay pases de embarque generados. Los pases se crean tras el check-in con asiento asignado.</div>
      ) : (
        <div className="record-grid">
          {passList.map((row) => {
            const flight = flights?.find((f) => f.id === row.flightId);
            return (
              <article className="record-card" key={row.reservationCode} style={{ cursor: "pointer" }} onClick={() => {
                const f = flights?.find((fl) => fl.id === row.flightId);
                setSelected({ ...row, origin: f?.origin ?? "", destination: f?.destination ?? "", flight_date: f?.flight_date ?? "", departure: f?.departure ?? "", arrival: f?.arrival ?? "" });
              }}>
                <strong>{row.reservationCode}</strong>
                <p>{row.passenger}</p>
                <p>Vuelo: {flight ? `${flight.origin} → ${flight.destination}` : row.flightId}</p>
                <p>Asiento: {row.seat}</p>
                <p>Pase: {row.boardingPass}</p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

type EditableResource = "airports" | "capacities" | "fares" | "disruptions" | "users" | "notifications";

type InvoiceRow = { id: string; number: string; amount: number; issuedAt: string; reservationCode: string };
type ReservationRow = { code: string; flightId: string; cabin: string; passenger: string; passengers: { seat: string | null }[] };
type FlightRow = { id: string; origin: string; destination: string; flight_date: string; departure: string; arrival: string };
type TicketData = { reservationCode: string; passenger: string; flightId: string; origin: string; destination: string; flightDate: string; departure: string; arrival: string; cabin: string; seat: string | null };

function Comprobantes() {
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);
  const [reservations, setReservations] = useState<ReservationRow[] | null>(null);
  const [flights, setFlights] = useState<FlightRow[] | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/data/invoices", { cache: "no-store", signal: controller.signal }),
      fetch("/api/data/reservations", { cache: "no-store", signal: controller.signal }),
      fetch("/api/data/flights", { cache: "no-store", signal: controller.signal }),
    ])
      .then(async ([invRes, resRes, fltRes]) => {
        if (!invRes.ok || !resRes.ok || !fltRes.ok) throw new Error("No se pudieron cargar los comprobantes.");
        const [invBody, resBody, fltBody] = await Promise.all([invRes.json(), resRes.json(), fltRes.json()]);
        setInvoices((invBody.data ?? []) as InvoiceRow[]);
        setReservations((resBody.data ?? []) as ReservationRow[]);
        setFlights((fltBody.data ?? []) as FlightRow[]);
      })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [revision]);

  function downloadHtml(filename: string, html: string) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function eticketHtml(t: TicketData) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>E-ticket ${t.reservationCode}</title>
    <style>body{font-family:Consolas,monospace;color:#222;padding:24px}.bar{border:2px solid #222;padding:20px}.h{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.t{font-size:10px;color:#777;text-transform:uppercase}.v{font-size:16px;font-weight:700}.row{display:flex;justify-content:space-between;margin:8px 0}.qr{margin-top:24px;display:flex;flex-direction:column;align-items:center}.q{display:flex;gap:2px}</style></head>
    <body><div class="bar"><div class="h"><div><p class="t">SIGV · Aerolínea Nacional</p><p class="v">E-TICKET</p></div><div style="text-align:right"><p class="v">${t.reservationCode}</p></div></div>
    <div class="row"><span class="t">Pasajero</span><span class="v">${t.passenger}</span></div>
    <div class="row"><span class="t">Vuelo</span><span class="v">${t.origin} → ${t.destination}</span></div>
    <div class="row"><span class="t">Fecha / Hora</span><span class="v">${new Date(t.flightDate).toLocaleDateString("es-AR")} · ${t.departure} → ${t.arrival}</span></div>
    <div class="row"><span class="t">Clase / Asiento</span><span class="v">${t.cabin} · ${t.seat ?? "Asignado en mostrador"}</span></div>
    <div class="row"><span class="t">Código de Reserva</span><span class="v">${t.reservationCode}</span></div>
    <div class="qr"><p class="t">Código de Embarque</p><div class="q">${qrCells(t.reservationCode).map((row) => `<div style="display:flex;gap:2px">${row.map((c) => `<div style="width:10px;height:10px;background:${c?"#222":"#eee"}"></div>`).join("")}</div>`).join("")}</div></div>
    <p style="margin-top:24px;font-size:11px;color:#777">Presenta este e-ticket junto con tu documento de identidad al abordar.</p></div></body></html>`;
  }

  function facturaHtml(t: TicketData, invoice: InvoiceRow) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Factura ${invoice.number}</title>
    <style>body{font-family:Consolas,monospace;color:#222;padding:24px}.bar{border:2px solid #222;padding:20px}.h{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.t{font-size:10px;color:#777;text-transform:uppercase}.v{font-size:16px;font-weight:700}.row{display:flex;justify-content:space-between;margin:8px 0}.total{margin-top:16px;padding-top:16px;border-top:1px solid #222;font-size:14px;font-weight:700}</style></head>
    <body><div class="bar"><div class="h"><div><p class="t">SIGV · Aerolínea Nacional</p><p class="v">FACTURA</p></div><div style="text-align:right"><p class="v">${invoice.number}</p></div></div>
    <div class="row"><span class="t">Pasajero</span><span class="v">${t.passenger}</span></div>
    <div class="row"><span class="t">Reserva</span><span class="v">${t.reservationCode}</span></div>
    <div class="row"><span class="t">Vuelo</span><span class="v">${t.origin} → ${t.destination}</span></div>
    <div class="row"><span class="t">Fecha</span><span class="v">${new Date(invoice.issuedAt).toLocaleDateString("es-AR")}</span></div>
    <div class="row"><span class="t">Clase</span><span class="v">${t.cabin}</span></div>
    <div class="total"><span>Total</span><span class="v">$${invoice.amount.toLocaleString("es-AR")}</span></div>
    <p style="margin-top:24px;font-size:11px;color:#777">Comprobante fiscal de la compra. Este documento es generado automáticamente tras el pago exitoso.</p></div></body></html>`;
  }

  function qrCells(code: string, size: number = 15) {
    let hash = 0;
    for (let i = 0; i < code.length; i++) hash = ((hash << 5) - hash + code.charCodeAt(i)) | 0;
    const cells: boolean[][] = [];
    for (let r = 0; r < size; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < size; c++) {
        hash = ((hash << 13) ^ (hash >> 17)) | 0;
        row.push(((hash >> (c % 5)) & 1) === 1);
      }
      cells.push(row);
    }
    return cells;
  }

  if (error) return <section className="panel"><p role="alert" className="error-text">{error}</p></section>;
  if (!invoices || !reservations || !flights) return <section className="panel"><p role="status">Cargando comprobantes…</p></section>;

  const byReservation = new Map(reservations.map((r: ReservationRow) => [r.code, r]));
  const byFlight = new Map(flights.map((f: FlightRow) => [f.id, f]));

  return (
    <section className="panel">
      <div className="panel-title"><div><p className="kicker">COMPROBANTES</p><h2>E-tickets y Facturas</h2></div><button className="button small" type="button" onClick={() => void setRevision((v) => v + 1)}>Actualizar</button></div>
      {invoices.length === 0 ? (
        <div className="empty-inline">No tienes comprobantes. Los e-tickets y facturas se generan tras un pago exitoso.</div>
      ) : (
        <div className="record-grid">
          {invoices.map((inv) => {
            const res = byReservation.get(inv.reservationCode);
            const flight = res ? byFlight.get(res.flightId) : null;
            const ticket: TicketData = {
              reservationCode: inv.reservationCode,
              passenger: res?.passenger ?? "",
              flightId: res?.flightId ?? "",
              origin: flight?.origin ?? "",
              destination: flight?.destination ?? "",
              flightDate: flight?.flight_date ?? "",
              departure: flight?.departure ?? "",
              arrival: flight?.arrival ?? "",
              cabin: res?.cabin ?? "",
              seat: res?.passengers?.[0]?.seat ?? null,
            };
            return (
              <article className="record-card" key={inv.number}>
                <strong>Factura {inv.number}</strong>
                <p>Reserva: {inv.reservationCode}</p>
                <p>Pasajero: {ticket.passenger}</p>
                <p>Vuelo: {ticket.origin} → {ticket.destination}</p>
                <p>Monto: $${inv.amount.toLocaleString("es-AR")}</p>
                <p>Emitida: {new Date(inv.issuedAt).toLocaleDateString("es-AR")}</p>
                <div className="action-row">
                  <button className="button small" type="button" onClick={() => downloadHtml(`eticket-${ticket.reservationCode}.html`, eticketHtml(ticket))}>Descargar E-ticket</button>
                  <button className="button small" type="button" onClick={() => downloadHtml(`factura-${inv.number}.html`, facturaHtml(ticket, inv))}>Descargar Factura</button>
                  <button className="button" type="button" disabled>Enviar por Email</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ResourceManager({ resource, live }: { resource: EditableResource; live: boolean }) {
  const { data, error, refresh } = useMock<EditableRow[]>(resource === "airports" && live ? "airports?includeArchived=1" : resource);
  const [message, setMessage] = useState<Notice>(null);
  const [editing, setEditing] = useState<EditableRow | null>(null);
  const [creating, setCreating] = useState(false);
  const title: Record<EditableResource, string> = { airports: "Aeropuertos", capacities: "Capacidades", fares: "Tarifas", disruptions: "Contingencias", users: "Usuarios y roles", notifications: "Notificaciones" };
  async function send(method: "POST" | "PATCH" | "DELETE", payload: Record<string, unknown>) {
    setMessage(null);
    const result = await mutate(resource, method, payload);
    setMessage({ ok: result.ok, text: result.ok ? "Cambios guardados correctamente." : result.error });
    if (result.ok) { setEditing(null); setCreating(false); refresh(); }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    if (editing) {
      if (resource === "airports") payload.code = String(editing.code);
      if (resource === "capacities" || resource === "fares" || resource === "disruptions") payload.flightId = String(editing.flightId);
      if (resource === "users") payload.userId = String(editing.id);
    }
    void send(creating ? "POST" : "PATCH", payload);
  }
  function fields() {
    if (resource === "airports") return <>{creating && <label>Código IATA<input name="code" pattern="[A-Za-z]{3}" required /></label>}<label>Ciudad<input name="city" defaultValue={String(editing?.city ?? "")} required /></label><label>Nombre<input name="name" defaultValue={String(editing?.name ?? "")} required /></label></>;
    if (resource === "capacities") return <div className="form-row"><label>Capacidad Economy<input name="economy" type="number" min="0" step="1" defaultValue={Number(editing?.capacityEconomy ?? 0)} required /></label><label>Capacidad Primera<input name="first" type="number" min="0" step="1" defaultValue={Number(editing?.capacityFirst ?? 0)} required /></label></div>;
    if (resource === "fares") return <div className="form-row"><label>Tarifa Economy<input name="economy" type="text" inputMode="decimal" placeholder="0" defaultValue={Number(editing?.economy ?? 0)} required /></label><label>Tarifa Primera<input name="first" type="text" inputMode="decimal" placeholder="0" defaultValue={Number(editing?.first ?? 0)} required /></label></div>;
    if (resource === "disruptions") return <><label>Estado<select name="status" defaultValue={String(editing?.status ?? "Activo")}><option>Activo</option><option>Retrasado</option><option>Cancelado</option></select></label><p className="form-hint">Al cancelar el vuelo se cancelan sus reservas y se generan avisos para los pasajeros.</p></>;
    if (resource === "users") return <label>Rol<select name="role" defaultValue={String(editing?.role ?? "pasajero")}><option value="pasajero">Pasajero</option><option value="mostrador">Mostrador</option><option value="admin">Administrador</option></select></label>;
    return null;
  }
  if (!live) return <GenericCollection resource={resource} live={false} />;
  return <section className="panel"><div className="panel-title"><div><p className="kicker">GESTIÓN EN SUPABASE</p><h2>{title[resource]}</h2></div>{resource === "airports" && <button type="button" className="button dark" onClick={() => { setEditing(null); setCreating(true); }}>+ Aeropuerto</button>}</div>
    {error && <p role="alert" className="error-text">{error}</p>}{!data && !error && <p role="status">Cargando…</p>}
    <div className="record-grid">{data?.map((row, index) => <article className="record-card" key={String(row.id ?? row.code ?? row.flightId ?? index)}><strong>{String(row.flightId ?? row.code ?? row.name ?? row.title ?? "Registro")}</strong>{Object.entries(row).filter(([key]) => !["id", "flightId", "code", "name"].includes(key)).slice(0, 5).map(([key, value]) => <p key={key}>{key}: {String(value ?? "—")}</p>)}<div className="action-row">{resource === "notifications" ? row.status === "Nueva" && <button type="button" className="button small" onClick={() => void send("PATCH", { id: row.id })}>Marcar leída</button> : <><button type="button" className="button small" onClick={() => { setCreating(false); setEditing(row); }}>Editar</button>{resource === "airports" && <button type="button" className="button small" onClick={() => void send(row.archived_at ? "PATCH" : "DELETE", row.archived_at ? { code: row.code, restore: true } : { code: row.code })}>{row.archived_at ? "Restaurar" : "Archivar"}</button>}</>}</div></article>)}</div>
    {(editing || creating) && <form className="stack-form inline-form" onSubmit={save} key={`${resource}-${String(editing?.id ?? editing?.code ?? editing?.flightId ?? "new")}`}><h3>{creating ? "Nuevo aeropuerto" : `Editar ${String(editing?.flightId ?? editing?.code ?? editing?.name ?? "registro")}`}</h3>{fields()}<div className="action-row"><button className="button dark" type="submit">Guardar</button><button className="button" type="button" onClick={() => { setEditing(null); setCreating(false); }}>Cerrar</button></div></form>}
    <ActionNotice notice={message} />
  </section>;
}

function Reservations({ live }: { live: boolean }) {
  const { data, error, refresh } = useMock<{ code: string; flightId: string; passenger: string; cabin: string; seats: number; status: string; amount: number; returnReservationCode?: string; passengers?: { checked_in_at: string | null }[] }[]>("reservations");
  const [message, setMessage] = useState<Notice>(null);
  async function cancel(code: string, roundTrip: boolean) {
    setMessage(null);
    const result = await mutate("reservations", "DELETE", { reservationCode: code });
    setMessage({ ok: result.ok, text: result.ok ? (roundTrip ? "Viaje de ida y vuelta cancelado y cupos liberados." : "Reserva cancelada y cupos liberados.") : result.error });
    if (result.ok) refresh();
  }
  return <section className="panel"><div className="panel-title"><div><p className="kicker">MIS VIAJES</p><h2>Reservas</h2></div><span className="subtle-count">{data?.length ?? "—"} reservas</span></div>{error && <p className="error-text" role="alert">{error}</p>}{!data && !error && <p role="status">Cargando reservas…</p>}{data?.length === 0 && <p className="empty-inline">Todavía no tenés reservas.</p>}<div className="record-grid">{data?.map((row) => <article className="record-card" key={row.code}><strong>{row.code}</strong><p>{row.flightId} · {row.passenger}</p><p>{row.seats} pasaje(s) · {row.cabin} · {money(row.amount)}</p>{row.returnReservationCode && <p>Ida y vuelta · Reserva vinculada {row.returnReservationCode}</p>}<p><Status value={row.status} /></p><div className="action-row">{row.status === "Pendiente de pago" && <Link className="button small" href={`/pasajero/pago?${new URLSearchParams({ reservation: row.code, ...(row.returnReservationCode ? { returnReservation: row.returnReservationCode } : {}) })}`}>Pagar prueba</Link>}{live && row.status !== "Cancelada" && !row.passengers?.some((person) => person.checked_in_at) && <button className="button small" type="button" onClick={() => cancel(row.code, Boolean(row.returnReservationCode))}>{row.returnReservationCode ? "Cancelar viaje completo" : "Cancelar"}</button>}{row.passengers?.some((person) => person.checked_in_at) && <span className="muted">Check-in realizado</span>}</div></article>)}</div><ActionNotice notice={message} /></section>;
}

function Profile({ live }: { live: boolean }) {
  const { data, error, refresh } = useMock<{ name: string; email: string; phone: string; document: string; pendingEmail?: string | null }>("profile");
  const [message, setMessage] = useState<Notice>(null);
  const parts = data?.name.trim().split(/\s+/) ?? [];
  const firstNameDisplay = parts[0] ?? "";
  const lastNameDisplay = parts.slice(1).join(" ") ?? "";
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const firstName = String(form.get("firstName") ?? "").trim();
    const lastName = String(form.get("lastName") ?? "").trim();
    const name = `${firstName} ${lastName}`.trim();
    const document = normalizeDocument(String(form.get("document") ?? ""));
    const phone = normalizePhone(String(form.get("phone") ?? ""));
    const email = normalizeEmail(String(form.get("email") ?? ""));
    let problem: string | null = null;
    if (!firstName || !lastName) problem = "Ingresá tu nombre y apellido.";
    else if (documentProblem(document)) problem = documentProblem(document);
    else if (emailProblem(email)) problem = emailProblem(email);
    else problem = phoneProblem(phone);
    if (problem) { setMessage({ ok: false, text: problem }); return; }
    setMessage(null);
    const result = await mutate("profile", "PATCH", { name, document, phone });
    let text = result.ok ? "Perfil actualizado correctamente." : result.error;
    let ok = result.ok;
    if (result.ok && data && email !== normalizeEmail(data.email)) {
      try {
        const supabase = createClient();
        const { error: emailError } = await supabase.auth.updateUser(
          { email },
          { emailRedirectTo: `${window.location.origin}/auth/callback?next=/pasajero/perfil` },
        );
        if (emailError) throw emailError;
        text = `Perfil actualizado. Enviamos un enlace de confirmación a ${email}. Seguís recibiendo los correos en ${data.email} hasta abrirlo.`;
      } catch (reason) {
        ok = false;
        text = `Perfil actualizado, pero no se pudo pedir el cambio de correo: ${mapAuthError(reason)}`;
      }
    }
    setMessage({ ok, text });
    refresh();
  }
  if (!live) return <GenericCollection resource="profile" live={false} />;
  return <section className="panel"><div className="panel-title"><div><p className="kicker">MIS DATOS</p><h2>Perfil personal</h2></div></div>{error && <p role="alert" className="error-text">{error}</p>}{!data && !error && <p role="status">Cargando perfil…</p>}{data && <form className="stack-form" onSubmit={save} key={JSON.stringify(data)}>
    {data.pendingEmail && <p className="form-status" role="status">Hay un cambio de correo pendiente en <strong>{data.pendingEmail}</strong>. Seguís usando {data.email} hasta abrir el enlace de confirmación.</p>}
    <label>Correo electrónico<input name="email" type="email" defaultValue={data.email} autoComplete="email" required /></label>
    <label>Nombre<input name="firstName" defaultValue={firstNameDisplay} required /></label>
    <label>Apellido<input name="lastName" defaultValue={lastNameDisplay} required /></label>
    <label>Documento<input name="document" defaultValue={data.document ?? ""} inputMode="numeric" pattern="[0-9]{6,8}" title="Entre 6 y 8 dígitos, sin letras ni espacios" /></label>
    <label>Teléfono<input name="phone" type="tel" defaultValue={data.phone ?? ""} autoComplete="tel" /></label>
    <button className="button dark">Guardar perfil</button>
    <p className="form-hint">Para cambiar el correo te enviamos un enlace de confirmación a la dirección nueva.</p>
  </form>}<ActionNotice notice={message} /></section>;
}

function GenericCollection({ resource, live }: { resource: string; live: boolean }) {
  const { data, error } = useMock<unknown>(resource);
  const records = data === null ? [] : Array.isArray(data) ? data : [data];
  const labels: Record<string, string> = { code: "Código", flightId: "Vuelo", name: "Nombre", email: "Correo", phone: "Teléfono", role: "Rol", status: "Estado", economy: "Economy", first: "Primera", passenger: "Pasajero", document: "Documento", cabin: "Clase", seats: "Pasajes", checkedIn: "Check-in", reservationCode: "Reserva", seat: "Asiento", baggageKg: "Equipaje (kg)", gate: "Puerta", title: "Aviso", kind: "Tipo", affectedBookings: "Reservas afectadas", occupancy: "Ocupación", amount: "Monto", offline: "Disponible offline" };
  return <section className="panel"><div className="panel-title"><div><p className="kicker">{live ? "DATOS DE SUPABASE" : "DATOS DE DEMOSTRACIÓN"}</p><h2>Vista general</h2></div><span className="subtle-count">API /api/data/{resource}</span></div>{error ? <p role="alert" className="error-text">{error}</p> : data === null ? <p role="status">Cargando datos…</p> : records.length === 0 ? <div className="empty-inline">Todavía no hay elementos para mostrar.</div> : <div className="record-grid">{records.map((record, index) => <div className="record-card" key={index}>{Object.entries(record as Record<string, unknown>).slice(0, 8).map(([key, value]) => <div key={key}><span>{labels[key] ?? key.replace(/([A-Z])/g, " $1")}</span><strong>{value === null || value === undefined || value === "" ? "—" : typeof value === "boolean" ? value ? "Sí" : "No" : key === "occupancy" ? `${value}%` : String(value)}</strong></div>)}</div>)}</div>}{!live && <p className="form-hint">Contenido ficticio para definir componentes, estados y contratos de API.</p>}</section>;
}

type Ticket = { id: string; reservationCode: string; flightId: string; passenger: string; seat: string; status: string };

function Tickets() {
  const { data, error } = useMock<Ticket[]>("tickets");
  return <section className="panel"><div className="panel-title"><div><p className="kicker">MIS VIAJES</p><h2>Tickets digitales</h2></div></div>
    {error ? <p role="alert" className="error-text">{error}</p> : !data ? <p role="status">Cargando tickets…</p> : data.length === 0 ? <p className="empty-inline">Todavía no tenés tickets.</p> : <div className="record-grid">{data.map((ticket) => <article className="record-card" key={ticket.id}><strong>{ticket.flightId} · {ticket.passenger}</strong><p>Reserva {ticket.reservationCode} · Asiento {ticket.seat}</p><p>{ticket.status}</p><a className="button small" href={`/api/tickets/${ticket.id}/download`}>Descargar para usar sin conexión</a></article>)}</div>}
    <p className="form-hint">La copia descargada conserva los datos del momento. Revisá novedades del vuelo al volver a conectarte.</p>
  </section>;
}

function Reports({ live }: { live: boolean }) {
  const { data, error } = useMock<{ flightId: string; cabin: string; occupancy: number }[]>("reports");
  function exportCsv() {
    if (!data) return;
    const cell = (value: string) => `"${(/^[=+@-]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}\"`;
    const csv = "Vuelo,Clase,Ocupación (%)\r\n" + data.map((row) => [cell(row.flightId), cell(row.cabin), row.occupancy].join(",")).join("\r\n");
    downloadFile("SIGV-ocupacion.csv", `\uFEFF${csv}`, "text/csv;charset=utf-8");
  }
  return <section className="panel"><div className="panel-title"><div><p className="kicker">OCUPACIÓN DE VUELOS</p><h2>Asientos vendidos por clase</h2></div><span className="subtle-count">{live ? "Datos en línea" : "Cifras de prueba"}</span></div>{error ? <p role="alert" className="error-text">{error}</p> : !data ? <p role="status">Cargando reporte…</p> : <><div className="action-row">{live ? <Link className="button small" href="/api/reports/occupancy/download" download prefetch={false}>Descargar CSV</Link> : <button className="button small" type="button" onClick={exportCsv}>Descargar CSV de prueba</button>}</div><div className="report-list">{data.map((row) => <div className="report-row" key={`${row.flightId}-${row.cabin}`}><div><strong>{row.flightId}</strong><span>{row.cabin}</span></div><div className="report-bar" aria-label={`${row.occupancy}% de ocupación`}><span style={{ width: `${row.occupancy}%` }} /></div><strong>{row.occupancy}%</strong></div>)}</div></>}{!live && <p className="form-hint">Cifras simuladas para revisar el formato del reporte.</p>}</section>;
}

function Dashboard({ module, sprint, live }: { module: Module; sprint: number; live: boolean }) {
  const { data } = useMock<Record<string, number>>("dashboard");
  const role = module.role;
  const actions = role === "admin" ? [{ label: "Ver vuelos", href: "/admin/vuelos" }, { label: "Capacidades", href: "/admin/capacidades" }, { label: "Tarifas", href: "/admin/tarifas" }] : role === "mostrador" ? [{ label: "Manifiesto", href: "/mostrador/manifiesto" }, { label: "Hacer check-in", href: "/mostrador/check-in" }] : [{ label: "Buscar vuelos", href: "/pasajero/buscar-vuelos" }, { label: "Mi perfil", href: "/pasajero/perfil" }, ...(sprint >= findModule("pasajero", "mis-reservas")!.sprint ? [{ label: "Mis reservas", href: "/pasajero/mis-reservas" }] : [])];
  return <><div className="welcome-banner"><div><p className="kicker light">BIENVENIDO A SIGV</p><h2>{role === "admin" ? "Operación aérea, en un solo panel." : role === "mostrador" ? "Cada embarque, bajo control." : "Tu próximo destino está más cerca."}</h2><p>{live ? "Consultá la operación con datos del proyecto SIGV." : "Revisá los flujos de la aerolínea con información de prueba."}</p></div><span aria-hidden="true">✈</span></div><div className="metrics"><div><span>Vuelos programados</span><strong>{data?.flights ?? "—"}</strong></div><div><span>Vuelos activos</span><strong>{data?.activeFlights ?? "—"}</strong></div><div><span>Reservas</span><strong>{data?.reservations ?? "—"}</strong></div></div><section className="panel"><p className="kicker">ACCESOS RÁPIDOS</p><h2>Continuar</h2><div className="shortcut-grid">{actions.map((action) => <Link href={action.href} key={action.href}>{action.label}<span>→</span></Link>)}</div></section></>;
}

export function ModuleContent({ module, sprint, initialFlight, initialQuery, live }: { module: Module; sprint: number; initialFlight?: string; initialQuery: BookingQuery & { origin: string; destination: string; date: string; reservation: string; returnReservation?: string }; live: boolean }) {
  if (module.slug === "inicio") return <Dashboard module={module} sprint={sprint} live={live} />;

  if (module.role === "admin" && module.slug === "vuelos") return <AdminFlights live={live} />;
  if (module.slug === "compra") return <PassengerBooking key={JSON.stringify([initialFlight, initialQuery])} initialFlight={initialFlight} initialQuery={initialQuery} live={live} />;
  if (module.slug === "pago") return <Payment reservationCode={initialQuery.reservation} returnReservation={initialQuery.returnReservation} live={live} />;
  if (module.slug === "mis-reservas") return <Reservations live={live} />;
  if (module.slug === "perfil") return <Profile live={live} />;
  if (module.slug === "check-in") return <CheckIn live={live} />;
  if (module.slug === "manifiesto") return <Manifest />;
  if (module.slug === "boarding-pass") return <BoardingPass />;
  if (module.slug === "facturas") return <Comprobantes />;
  if (module.slug === "reportes") return <Reports live={live} />;
  if (module.role === "pasajero" && module.slug === "tickets" && live) return <Tickets />;
  if (live && ["aircraft", "schedules", "frequencies", "configurations", "seats"].includes(module.resource)) return <DomainManager resource={module.resource as "aircraft" | "schedules" | "frequencies" | "configurations" | "seats"} canEdit={module.role === "admin"} />;
  if (["airports", "capacities", "fares", "disruptions", "users", "notifications"].includes(module.resource)) return <ResourceManager resource={module.resource as EditableResource} live={live} />;
  return <GenericCollection resource={module.resource} live={live} />;
}
