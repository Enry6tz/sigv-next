"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { countDepartures, durationMinutes, validateFlightSchedule, type Aircraft } from "@/lib/flight-schedule";
import { mutate } from "@/lib/mutations";
import type { AdminFlight } from "@/lib/admin-flights";

type Airport = { code: string; name: string; city: string };
const weekdays = [{ day: 1, label: "Lun" }, { day: 2, label: "Mar" }, { day: 3, label: "Mié" }, { day: 4, label: "Jue" }, { day: 5, label: "Vie" }, { day: 6, label: "Sáb" }, { day: 0, label: "Dom" }];
const money = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(value);

export function FlightCreateForm({ live, onCancel, onSuccess, onBusyChange, initialFlight }: {
  live: boolean; onCancel: () => void; onSuccess: (message: string) => void; onBusyChange: (busy: boolean) => void;
  initialFlight?: AdminFlight;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [airports, setAirports] = useState<Airport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ flightCode: initialFlight?.code ?? "", aircraftId: initialFlight?.aircraftId ?? "",
    origin: initialFlight?.origin ?? "", destination: initialFlight?.destination ?? "",
    departure: initialFlight?.departure ?? "", arrival: initialFlight?.arrival ?? "",
    saleStart: initialFlight?.saleStart ?? "", saleEnd: initialFlight?.saleEnd ?? "",
    seatsEconomy: String(initialFlight?.seatsEconomy ?? 0), seatsFirst: String(initialFlight?.seatsFirst ?? 0),
    economy: initialFlight ? String(initialFlight.economy) : "", first: initialFlight ? String(initialFlight.first) : "" });
  const [days, setDays] = useState<number[]>(initialFlight?.weekdays ?? []);
  const [status, setStatus] = useState(initialFlight?.status ?? "Activa");
  const [notes, setNotes] = useState({ baggageIncluded: initialFlight?.baggageIncluded ?? false,
    seatSelectionEnabled: initialFlight?.seatSelectionEnabled ?? true, onlineCheckInEnabled: initialFlight?.onlineCheckInEnabled ?? true });

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [planes, ports] = await Promise.all(["aircraft", "airports"].map(async (resource) => {
          const response = await fetch(`/api/data/${resource}`, { cache: "no-store" });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error ?? "No se pudieron cargar las opciones del formulario.");
          return body.data;
        }));
        if (active) {
          setAircraft(planes.filter((plane: Aircraft) => !plane.archivedAt && plane.status === "Activa"));
          setAirports(ports);
        }
      } catch (reason) {
        if (active) setLoadError(reason instanceof Error && reason.message !== "Failed to fetch" ? reason.message : "No se pudieron cargar las aeronaves y aeropuertos. Revisá tu conexión.");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [reload]);

  useEffect(() => {
    if (loading || loadError) return;
    const control = formRef.current?.elements.namedItem(initialFlight ? "aircraftId" : "flightCode");
    if (control instanceof HTMLElement) control.focus({ preventScroll: true });
    formRef.current?.closest("dialog")?.scrollTo({ top: 0 });
  }, [loading, loadError, initialFlight]);

  const selected = aircraft.find((plane) => plane.id === form.aircraftId);
  const duration = durationMinutes(form.departure, form.arrival);
  const total = Number(form.seatsEconomy) + Number(form.seatsFirst);
  const capacity = selected ? selected.capacityEconomy + selected.capacityFirst : 0;
  const exceeds = selected && (Number(form.seatsEconomy) > selected.capacityEconomy || Number(form.seatsFirst) > selected.capacityFirst);
  const departures = countDepartures(form.saleStart, form.saleEnd, days);
  const update = (key: keyof typeof form, value: string) => {
    setError("");
    setForm((current) => ({ ...current, [key]: value }));
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    const payload = { ...form, ...notes, action: "publish", weekdays: days, status, id: initialFlight?.id };
    const invalid = validateFlightSchedule(payload, selected);
    if (invalid || !selected) { setError(invalid ?? "Seleccioná una aeronave disponible."); return; }
    setBusy(true); onBusyChange(true);
    const result = await mutate(initialFlight ? "admin-flights" : "flights", initialFlight ? "PATCH" : "POST", payload);
    if (result.ok) onSuccess(initialFlight
      ? live ? `Vuelo ${form.flightCode} actualizado correctamente.` : "Edición simulada. No se guardaron datos."
      : live
      ? `Programación ${form.flightCode.toUpperCase()} publicada correctamente. ${result.data.created} vuelo(s) creados.`
      : `Simulación completada: se generarían ${departures} vuelo(s). No se guardaron datos.`);
    else setError(result.error);
    setBusy(false); onBusyChange(false);
  }

  return <form ref={formRef} className="flight-create-form" onSubmit={submit} aria-label={initialFlight ? `Editar vuelo ${initialFlight.code}` : "Alta de nuevo vuelo"}>
    <div className="flight-form-heading"><h3>{initialFlight ? `Editar vuelo ${initialFlight.code}` : "Crear nuevo vuelo"}</h3></div>
    {loading && <p role="status">Cargando aeronaves y aeropuertos…</p>}
    {loadError && <div className="flight-form-alert" role="alert"><p>{loadError}</p><button type="button" className="button small" onClick={() => { setLoadError(""); setLoading(true); setReload((value) => value + 1); }}>Reintentar</button></div>}
    {!loading && !loadError && aircraft.length === 0 && <p role="alert" className="error-text">No hay aeronaves activas. Agregá o activá una aeronave en Aviones para crear el vuelo.</p>}
    {!loading && !loadError && airports.length < 2 && <p role="alert" className="error-text">Necesitás al menos dos aeropuertos activos para configurar una ruta.</p>}
    <fieldset className="flight-form-body" disabled={busy || loading || Boolean(loadError)}>
      <legend className="sr-only">Datos de la programación</legend>
      <div className="flight-form-column">
        <fieldset className="flight-section"><legend>A — Datos operativos</legend><div className="stack-form">
          <div className="form-row">
            <label>Código de vuelo *<input name="flightCode" placeholder="AR-1420" value={form.flightCode} readOnly={Boolean(initialFlight)} onChange={(event) => update("flightCode", event.target.value.toUpperCase())} minLength={2} maxLength={20} pattern="[A-Za-z0-9][A-Za-z0-9-]{1,19}" required /></label>
            <label>Aeronave *<select name="aircraftId" value={form.aircraftId} onChange={(event) => {
              setError("");
              const plane = aircraft.find((item) => item.id === event.target.value);
              setForm((current) => ({ ...current, aircraftId: event.target.value, seatsEconomy: String(plane?.capacityEconomy ?? 0), seatsFirst: String(plane?.capacityFirst ?? 0) }));
            }} required><option value="">Seleccioná una aeronave</option>{aircraft.map((plane) => <option key={plane.id} value={plane.id}>{plane.model} · {plane.registration}</option>)}</select></label>
          </div>
          <div className="form-row">{(["origin", "destination"] as const).map((key) => <label key={key}>Aeropuerto {key === "origin" ? "origen" : "destino"} *<select name={key} value={form[key]} onChange={(event) => update(key, event.target.value)} required><option value="">Seleccioná un aeropuerto</option>{airports.map((port) => <option key={port.code} value={port.code} disabled={port.code === form[key === "origin" ? "destination" : "origin"]}>{port.code} — {port.city} · {port.name}</option>)}</select></label>)}</div>
          <div className="form-row">{(["departure", "arrival"] as const).map((key) => <label key={key}>Hora de {key === "departure" ? "salida" : "llegada"} *<input name={key} type="time" value={form[key]} onChange={(event) => update(key, event.target.value)} required /></label>)}</div>
          <label>Duración estimada<input readOnly value={duration === null ? "" : `${Math.floor(duration / 60)}h ${duration % 60}m`} placeholder="Completá los horarios" aria-describedby="duration-hint" /></label>
          <p id="duration-hint" className="form-hint">Calculada automáticamente.{form.arrival && form.departure && form.arrival < form.departure ? " Llegada al día siguiente." : ""}</p>
        </div></fieldset>
        <fieldset className="flight-section"><legend>B — Frecuencia y período de venta</legend><div className="stack-form">
          <div><p className="flight-field-label" id="operation-days">Días de operación *</p><div className="weekday-toggles" role="group" aria-labelledby="operation-days">{weekdays.map(({ day, label }) => <button key={day} type="button" aria-pressed={days.includes(day)} onClick={() => { setError(""); setDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day]); }}>{label}</button>)}</div><p className="form-hint">{days.length} {days.length === 1 ? "día" : "días"} por semana</p></div>
          <div className="form-row"><label>Período venta — desde *<input name="saleStart" type="date" value={form.saleStart} onChange={(event) => update("saleStart", event.target.value)} required /></label><label>Período venta — hasta *<input name="saleEnd" type="date" min={form.saleStart || undefined} value={form.saleEnd} onChange={(event) => update("saleEnd", event.target.value)} required /></label></div>
          <p className="form-hint">{initialFlight ? "Los cambios se aplican a los vuelos de esta programación. No se pueden quitar fechas con reservas vigentes." : "Se publicarán vuelos en los días seleccionados dentro de este período."}{departures > 0 && ` ${departures} vuelo(s) previstos.`}</p>
          {initialFlight && <label>Estado<select value={status} onChange={(event) => setStatus(event.target.value as AdminFlight["status"])}><option value="Activa">Activo</option><option value="Suspendida">Inactivo</option></select></label>}
        </div></fieldset>
      </div>
      <div className="flight-form-column">
        <fieldset className="flight-section"><legend>C — Capacidad y tarifas por clase</legend>
          <div className="flight-cabin-table"><div className="flight-cabin-head"><span>Clase</span><span>Asientos *</span><span>Precio (ARS) *</span></div>
            {([{ name: "Economy", description: "Clase turista", seats: "seatsEconomy", price: "economy", max: selected?.capacityEconomy ?? 582 }, { name: "Primera Clase", description: "Clase ejecutiva", seats: "seatsFirst", price: "first", max: selected?.capacityFirst ?? 12 }] as const).map((cabin) => <div className="flight-cabin-row" key={cabin.seats}>
              <div><strong>{cabin.name}</strong><small>{cabin.description}</small></div>
              <label className="flight-cabin-input"><span className="sr-only">Asientos {cabin.name}</span><input name={cabin.seats} type="number" min={0} max={cabin.max} step={1} value={form[cabin.seats]} onChange={(event) => update(cabin.seats, event.target.value)} required /><small>Máx. {cabin.max}</small></label>
              <label className="flight-cabin-input"><span className="sr-only">Precio {cabin.name} (ARS)</span><input name={cabin.price} type="number" min={0} max="9999999999.99" step="0.01" placeholder="0" value={form[cabin.price]} onChange={(event) => update(cabin.price, event.target.value)} required /></label>
            </div>)}
          </div>
          <div className={`flight-capacity-total${exceeds ? " exceeded" : ""}`} aria-live="polite"><span>Capacidad total asignada</span><strong>{total} / {capacity} asientos</strong><span>{!selected ? "Elegí una aeronave" : exceeds ? "Excede capacidad" : total === capacity ? "✓ Completo" : `${Math.max(0, capacity - total)} sin asignar`}</span></div>
          <div className="flight-capacity-track" role="progressbar" aria-label="Capacidad asignada" aria-valuemin={0} aria-valuemax={capacity || 1} aria-valuenow={Math.min(total, capacity || 1)}><span style={{ width: `${capacity ? Math.min(100, total / capacity * 100) : 0}%` }} /></div>
        </fieldset>
        <fieldset className="flight-section"><legend>D — Notas adicionales de tarifa</legend><div className="flight-fare-options">
          {([{ key: "baggageIncluded", label: "Incluye equipaje de bodega (23 kg) en Economy" }, { key: "seatSelectionEnabled", label: "Selección de asiento habilitada en venta web" }, { key: "onlineCheckInEnabled", label: "Check-in online disponible 48h antes del vuelo" }] as const).map(({ key, label }) => <label key={key}><input type="checkbox" name={key} checked={notes[key]} onChange={(event) => setNotes((current) => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}
        </div>
          <div className="flight-fare-summary"><p className="kicker">RESUMEN DE TARIFAS</p><dl><div><dt>Economy (base)</dt><dd>{money(Number(form.economy))}</dd></div><div><dt>Primera Clase (base)</dt><dd>{money(Number(form.first))}</dd></div><div className="flight-fare-difference"><dt>Diferencia de clase</dt><dd>{Number(form.economy) > 0 && form.first !== "" ? `× ${(Number(form.first) / Number(form.economy)).toLocaleString("es-AR", { maximumFractionDigits: 1 })}` : "—"}</dd></div></dl></div>
        </fieldset>
      </div>
    </fieldset>
    {error && <p className="flight-form-alert error-text" role="alert">{error}</p>}
    <div className="flight-form-footer"><p className="form-hint">* Todos los campos marcados son obligatorios.</p><div className="action-row"><button className="button" type="button" disabled={busy} onClick={onCancel}>Cancelar</button><button className="button dark" type="submit" disabled={busy || loading || Boolean(loadError) || !aircraft.length || airports.length < 2}>{busy ? "Guardando…" : initialFlight ? "Guardar cambios" : live ? "Guardar y publicar vuelo →" : "Simular publicación →"}</button></div></div>
  </form>;
}
