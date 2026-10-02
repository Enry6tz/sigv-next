"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { Module } from "@/lib/catalog";
import type { Flight } from "@/lib/mock-data";
import { SimpleMockForm } from "./simple-mock-form";
import { DomainManager } from "./domain-manager";

const money = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
const date = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("es-AR");

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

function FlightTable({ flights, admin, sprint, live = false }: { flights: Flight[]; admin?: boolean; sprint: number; live?: boolean }) {
  return <><div className="table-wrap"><table><thead><tr><th>Vuelo</th><th>Ruta</th><th>Salida</th><th>Tarifas desde</th><th>Disponibilidad</th><th>Estado</th><th></th></tr></thead><tbody>{flights.map((flight) => <tr key={flight.id}><td><strong>{flight.id}</strong><small>{date(flight.date)}</small></td><td><strong>{flight.origin} → {flight.destination}</strong><small>Aerolínea nacional</small></td><td>{flight.departure}<small>Llegada {flight.arrival}</small></td><td>{money(flight.economy)}<small>Primera {money(flight.first)}</small></td><td>{flight.seatsEconomy + flight.seatsFirst} lugares</td><td><Status value={flight.status} /></td><td>{admin ? <span className="muted">{live ? "Gestionar abajo" : sprint >= 2 ? "Editar · Cancelar" : "Ver detalle"}</span> : sprint >= 2 ? <Link className="inline-action" href={`/pasajero/compra?flight=${flight.id}`}>Elegir →</Link> : <span className="muted">Compra en S2</span>}</td></tr>)}</tbody></table></div><div className="flight-mobile-list">{flights.map((flight) => <article className="flight-mobile-card" key={flight.id}><div className="flight-mobile-head"><span>{flight.id} · {date(flight.date)}</span><Status value={flight.status} /></div><div className="flight-times"><div><strong>{flight.departure}</strong><small>{flight.origin}</small></div><span>────── ✈ ──────</span><div><strong>{flight.arrival}</strong><small>{flight.destination}</small></div></div><div className="flight-mobile-foot"><div><small>DESDE · ECONOMY</small><strong>{money(flight.economy)}</strong><small>Primera {money(flight.first)}</small></div>{admin ? <span className="muted">{flight.seatsEconomy + flight.seatsFirst} lugares</span> : sprint >= 2 ? <Link className="button dark small" href={`/pasajero/compra?flight=${flight.id}`}>Elegir →</Link> : <span className="muted">Compra en S2</span>}</div></article>)}</div>{flights.length === 0 && <div className="empty-inline">No hay vuelos para esa búsqueda. Probá con otra ruta o fecha.</div>}</>;
}

function SearchFlights({ sprint, initialQuery, live }: { sprint: number; initialQuery: { origin: string; destination: string; date: string }; live: boolean }) {
  const { data, error } = useMock<Flight[]>("flights");
  const [origin, setOrigin] = useState(initialQuery.origin);
  const [destination, setDestination] = useState(initialQuery.destination);
  const [travelDate, setTravelDate] = useState(initialQuery.date);
  const [searched, setSearched] = useState(false);
  const filtered = (data ?? []).filter((f) => (!origin || f.origin === origin) && (!destination || f.destination === destination) && (!travelDate || f.date === travelDate));
  return <>
    <section className="panel search-panel"><div className="panel-title"><div><p className="kicker">CONSULTA DE DISPONIBILIDAD</p><h2>Encontrá tu próximo vuelo</h2></div><span className="subtle-count">{data?.length ?? "—"} vuelos {live ? "en línea" : "de prueba"}</span></div>
      <form className="filter-grid" onSubmit={(event) => { event.preventDefault(); setSearched(true); }}><label>Origen<select value={origin} onChange={(e) => setOrigin(e.target.value)}><option value="">Todos</option><option value="EZE">Buenos Aires (EZE)</option><option value="AEP">Buenos Aires (AEP)</option><option value="COR">Córdoba (COR)</option></select></label><label>Destino<select value={destination} onChange={(e) => setDestination(e.target.value)}><option value="">Todos</option><option value="BRC">Bariloche (BRC)</option><option value="MDZ">Mendoza (MDZ)</option><option value="SCL">Santiago (SCL)</option><option value="USH">Ushuaia (USH)</option><option value="EZE">Buenos Aires (EZE)</option></select></label><label>Fecha de ida<input type="date" value={travelDate} onChange={(e) => setTravelDate(e.target.value)} /></label><button className="button dark" type="submit">Buscar vuelos</button></form>
    </section>
    <section className="panel"><div className="panel-title"><div><p className="kicker">RESULTADOS</p><h2>Vuelos disponibles</h2></div><span className="subtle-count">{filtered.length} resultados</span></div>{error ? <p role="alert" className="error-text">{error}</p> : !data ? <p role="status">Cargando vuelos…</p> : <FlightTable flights={filtered} sprint={sprint} live={live} />}{searched && <p role="status" className="form-hint">Resultados actualizados para los filtros seleccionados.</p>}</section>
  </>;
}

function AdminFlights({ sprint, live }: { sprint: number; live: boolean }) {
  const { data, error, refresh } = useMock<Flight[]>(live ? "flights?includeArchived=1" : "flights");
  const [filter, setFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Flight | null>(null);
  const [message, setMessage] = useState("");
  const visible = (data ?? []).filter((f) => `${f.id} ${f.origin} ${f.destination}`.toLowerCase().includes(filter.toLowerCase()));
  async function edit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const changes = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/data/flights", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ flightId: editing.id, ...changes }) });
    const body = await response.json();
    setMessage(response.ok ? "Vuelo actualizado en Supabase." : body.error);
    if (response.ok) { setEditing(null); refresh(); }
  }
  async function archive(flight: Flight) {
    const method = flight.archivedAt ? "PATCH" : "DELETE";
    const body = flight.archivedAt ? { flightId: flight.id, restore: true } : { flightId: flight.id };
    const response = await fetch("/api/data/flights", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    setMessage(response.ok ? flight.archivedAt ? "Vuelo restaurado." : "Vuelo archivado. Podés restaurarlo desde esta lista." : result.error);
    if (response.ok) refresh();
  }
  return <section className="panel"><div className="panel-title"><div><p className="kicker">INVENTARIO DE VUELOS</p><h2>Programaciones</h2></div><button className="button dark" onClick={() => setShowForm(!showForm)}>{showForm ? "Cerrar formulario" : "+ Crear vuelo"}</button></div>
    {showForm && <div className="inline-form"><h3>Nueva programación</h3><SimpleMockForm resource="flights" live={live} onSuccess={refresh} fields={[{ name: "flightCode", label: "Código de vuelo" }, { name: "origin", label: "Origen (IATA)" }, { name: "destination", label: "Destino (IATA)" }, { name: "date", label: "Fecha", type: "date" }, { name: "departure", label: "Hora de salida", type: "time" }, { name: "arrival", label: "Hora de llegada", type: "time" }, { name: "economy", label: "Tarifa Economy", type: "number" }, { name: "first", label: "Tarifa Primera", type: "number" }, { name: "seatsEconomy", label: "Cupos Economy", type: "number" }, { name: "seatsFirst", label: "Cupos Primera", type: "number" }]} button={live ? "Crear vuelo" : "Simular alta"} /></div>}
    <div className="table-controls"><label className="search-field">Buscar código o ruta<input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Ej. AR-1420 o EZE" /></label><span>{visible.length} vuelos registrados</span></div>
    {error ? <p role="alert" className="error-text">{error}</p> : !data ? <p role="status">Cargando vuelos…</p> : <FlightTable flights={visible} admin sprint={sprint} live={live} />}
    {live && <div className="record-grid">{visible.map((flight) => <div className="record-card" key={flight.id}><strong>{flight.id} · {flight.origin} → {flight.destination}</strong><p>{flight.archivedAt ? "Archivado" : flight.status} · {date(flight.date)}</p><div className="action-row"><button type="button" className="button small" onClick={() => setEditing(flight)}>Editar</button><button type="button" className="button small" onClick={() => archive(flight)}>{flight.archivedAt ? "Restaurar" : "Archivar"}</button></div></div>)}</div>}
    {editing && <form className="stack-form inline-form" onSubmit={edit}><h3>Editar {editing.id}</h3><div className="form-row"><label>Fecha<input type="date" name="date" defaultValue={editing.date} required /></label><label>Puerta<input name="gate" defaultValue="" placeholder="Ej. B04" /></label></div><div className="form-row"><label>Salida<input type="time" name="departure" defaultValue={editing.departure} required /></label><label>Llegada<input type="time" name="arrival" defaultValue={editing.arrival} required /></label></div><label>Estado<select name="status" defaultValue={editing.status}><option>Activo</option><option>Retrasado</option><option>Cancelado</option></select></label><div className="action-row"><button className="button dark" type="submit">Guardar cambios</button><button className="button" type="button" onClick={() => setEditing(null)}>Cerrar</button></div></form>}
    {message && <p role="status" className="form-status">{message}</p>}
  </section>;
}

type ReservationResult = { code: string; flightId: string; cabin: string; seats: number; status: string };

function Booking({ initialFlight, live }: { initialFlight?: string; live: boolean }) {
  const { data: flights } = useMock<Flight[]>("flights");
  const [count, setCount] = useState(1);
  const [cabin, setCabin] = useState("Economy");
  const [flightId, setFlightId] = useState(initialFlight ?? "AR-1420");
  const [result, setResult] = useState<ReservationResult | null>(null);
  const [error, setError] = useState("");
  const flight = flights?.find((f) => f.id === flightId);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setResult(null);
    const form = new FormData(event.currentTarget);
    const passengers = Array.from({ length: count }, (_, index) => ({ firstName: form.get(`firstName${index}`), lastName: form.get(`lastName${index}`), document: form.get(`document${index}`) }));
    const response = await fetch("/api/data/reservations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ flightId, cabin, passengerCount: count, passengers }) });
    const body = await response.json();
    if (response.ok) setResult(body.data); else setError(body.error ?? "No se pudo crear la reserva.");
  }
  return <div className="two-column"><section className="panel"><p className="kicker">PASO 1 DE 2</p><h2>Datos de la reserva</h2><form className="stack-form" onSubmit={submit}><label>Vuelo<select value={flightId} onChange={(e) => setFlightId(e.target.value)}>{flights?.map((f) => <option key={f.id} value={f.id}>{f.id} · {f.origin} → {f.destination}</option>)}</select></label><div className="form-row"><label>Cabina<select value={cabin} onChange={(e) => setCabin(e.target.value)}><option>Economy</option><option>Primera</option></select></label><label>Pasajeros<select value={count} onChange={(e) => setCount(Number(e.target.value))}>{Array.from({ length: 9 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label></div>{Array.from({ length: count }, (_, index) => <fieldset key={index}><legend>Pasajero {index + 1}</legend><div className="form-row"><label>Nombre<input name={`firstName${index}`} required /></label><label>Apellido<input name={`lastName${index}`} required /></label></div><label>DNI / documento<input name={`document${index}`} required /></label></fieldset>)}<button className="button dark" type="submit">Continuar con la reserva</button></form>{error && <p role="alert" className="error-text">{error}</p>}{result && <div className="success-box" role="status"><strong>{live ? "Reserva creada" : "Reserva simulada"}: {result.code}</strong><p>{result.seats} pasajero(s) · {result.cabin}. {live ? "Los cupos quedaron reservados en Supabase." : "Esta reserva no se guarda al reiniciar."}</p><Link className="button dark small" href={`/pasajero/pago?reservation=${result.code}`}>Ir al pago de prueba →</Link></div>}</section><aside className="panel summary-panel"><p className="kicker">TU SELECCIÓN</p><h2>{flight?.origin ?? "EZE"} → {flight?.destination ?? "BRC"}</h2><p>{flight ? `${date(flight.date)} · ${flight.departure} a ${flight.arrival}` : "Cargando horario…"}</p><div className="summary-total"><span>Precio estimado</span><strong>{money(((cabin === "Economy" ? flight?.economy : flight?.first) ?? 0) * count)}</strong></div><p className="form-hint">{live ? "La disponibilidad se confirma al crear la reserva." : "Tarifas ficticias para revisar el recorrido."}</p></aside></div>;
}

function Payment({ reservationCode, live }: { reservationCode: string; live: boolean }) {
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/data/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const body = await response.json();
    setMessage(response.ok ? `Pago de prueba aprobado · comprobante ${body.data.invoice}. ${live ? "Estado guardado en Supabase." : "No se guardaron datos."} No se procesó dinero.` : body.error);
  }
  return <div className="two-column"><section className="panel"><p className="kicker">PASO 2 DE 2</p><h2>Pago de prueba</h2><form className="stack-form" onSubmit={submit}><label>Código de reserva<input name="reservationCode" placeholder="DEMO-..." defaultValue={reservationCode} required /></label><label>Método de pago<select name="method"><option>Tarjeta de prueba</option><option>Transferencia de prueba</option></select></label><button className="button dark">Simular pago</button></form>{message && <div className="success-box" role="status">{message}</div>}</section><aside className="panel summary-panel"><h2>Sin cobros reales</h2><p>El endpoint devuelve una aprobación ficticia para revisar la pantalla y el contrato de respuesta.</p></aside></div>;
}

function CheckIn({ live }: { live: boolean }) {
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/data/check-in", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json();
    setMessage(response.ok ? `Check-in ${live ? "registrado" : "simulado"} · asiento ${body.data.seat} · pase ${body.data.boardingPass}` : body.error);
  }
  return <div className="two-column"><section className="panel"><p className="kicker">ATENCIÓN PRESENCIAL</p><h2>Registrar check-in</h2><form className="stack-form" onSubmit={submit}><label>Código de reserva<input name="reservationCode" placeholder="SIGV-..." required /></label>{live && <label>Documento del pasajero<input name="document" required /></label>}<div className="form-row"><label>Asiento<input name="seat" placeholder="Ej. 3A Economy / 1A Primera" pattern="[0-9]{1,2}[A-Fa-f]" required /></label><label>Equipaje en bodega (kg)<input type="number" name="baggageKg" min="0" max="40" step="0.1" defaultValue="0" required /></label></div><button className="button dark">Registrar check-in</button></form>{message && <div className="success-box" role="status">{message}</div>}</section><aside className="panel summary-panel"><h2>Verificación de mostrador</h2><p>{live ? "La reserva, el documento, la cabina, la disponibilidad del asiento y el equipaje se comprueban en Supabase antes de registrar el pase." : "Datos de prueba para recorrer el proceso."}</p></aside></div>;
}

type EditableRow = Record<string, string | number | null>;
type EditableResource = "airports" | "capacities" | "fares" | "disruptions" | "users" | "notifications";

function ResourceManager({ resource, live }: { resource: EditableResource; live: boolean }) {
  const { data, error, refresh } = useMock<EditableRow[]>(resource === "airports" && live ? "airports?includeArchived=1" : resource);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<EditableRow | null>(null);
  const [creating, setCreating] = useState(false);
  const title: Record<EditableResource, string> = { airports: "Aeropuertos", capacities: "Capacidades", fares: "Tarifas", disruptions: "Contingencias", users: "Usuarios y roles", notifications: "Notificaciones" };
  async function send(method: "POST" | "PATCH" | "DELETE", payload: Record<string, unknown>) {
    const response = await fetch(`/api/data/${resource}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json();
    setMessage(response.ok ? "Cambios guardados en Supabase." : body.error ?? "No se pudo guardar");
    if (response.ok) { setEditing(null); setCreating(false); refresh(); }
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
    if (resource === "capacities" || resource === "fares") return <div className="form-row"><label>{resource === "fares" ? "Tarifa Economy" : "Capacidad Economy"}<input name="economy" type="number" min="0" step={resource === "fares" ? "0.01" : "1"} defaultValue={resource === "capacities" ? Number(editing?.capacityEconomy ?? 0) : Number(editing?.economy ?? 0)} required /></label><label>{resource === "fares" ? "Tarifa Primera" : "Capacidad Primera"}<input name="first" type="number" min="0" step={resource === "fares" ? "0.01" : "1"} defaultValue={resource === "capacities" ? Number(editing?.capacityFirst ?? 0) : Number(editing?.first ?? 0)} required /></label></div>;
    if (resource === "disruptions") return <><label>Estado<select name="status" defaultValue={String(editing?.status ?? "Activo")}><option>Activo</option><option>Retrasado</option><option>Cancelado</option></select></label><p className="form-hint">Al cancelar el vuelo se cancelan sus reservas y se generan avisos para los pasajeros.</p></>;
    if (resource === "users") return <label>Rol<select name="role" defaultValue={String(editing?.role ?? "pasajero")}><option value="pasajero">Pasajero</option><option value="mostrador">Mostrador</option><option value="admin">Administrador</option></select></label>;
    return null;
  }
  if (!live) return <GenericCollection resource={resource} live={false} />;
  return <section className="panel"><div className="panel-title"><div><p className="kicker">GESTIÓN EN SUPABASE</p><h2>{title[resource]}</h2></div>{resource === "airports" && <button type="button" className="button dark" onClick={() => { setEditing(null); setCreating(true); }}>+ Aeropuerto</button>}</div>
    {error && <p role="alert" className="error-text">{error}</p>}{!data && !error && <p role="status">Cargando…</p>}
    <div className="record-grid">{data?.map((row, index) => <article className="record-card" key={String(row.id ?? row.code ?? row.flightId ?? index)}><strong>{String(row.flightId ?? row.code ?? row.name ?? row.title ?? "Registro")}</strong>{Object.entries(row).filter(([key]) => !["id", "flightId", "code", "name"].includes(key)).slice(0, 5).map(([key, value]) => <p key={key}>{key}: {String(value ?? "—")}</p>)}<div className="action-row">{resource === "notifications" ? row.status === "Nueva" && <button type="button" className="button small" onClick={() => void send("PATCH", { id: row.id })}>Marcar leída</button> : <><button type="button" className="button small" onClick={() => { setCreating(false); setEditing(row); }}>Editar</button>{resource === "airports" && <button type="button" className="button small" onClick={() => void send(row.archived_at ? "PATCH" : "DELETE", row.archived_at ? { code: row.code, restore: true } : { code: row.code })}>{row.archived_at ? "Restaurar" : "Archivar"}</button>}</>}</div></article>)}</div>
    {(editing || creating) && <form className="stack-form inline-form" onSubmit={save} key={`${resource}-${String(editing?.id ?? editing?.code ?? editing?.flightId ?? "new")}`}><h3>{creating ? "Nuevo aeropuerto" : `Editar ${String(editing?.flightId ?? editing?.code ?? editing?.name ?? "registro")}`}</h3>{fields()}<div className="action-row"><button className="button dark" type="submit">Guardar</button><button className="button" type="button" onClick={() => { setEditing(null); setCreating(false); }}>Cerrar</button></div></form>}
    {message && <p role="status" className="form-status">{message}</p>}
  </section>;
}

function Reservations({ live }: { live: boolean }) {
  const { data, error, refresh } = useMock<{ code: string; flightId: string; passenger: string; cabin: string; seats: number; status: string; amount: number; passengers?: { checked_in_at: string | null }[] }[]>("reservations");
  const [message, setMessage] = useState("");
  async function cancel(code: string) {
    const response = await fetch("/api/data/reservations", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reservationCode: code }) });
    const body = await response.json();
    setMessage(response.ok ? "Reserva cancelada y cupos liberados." : body.error);
    if (response.ok) refresh();
  }
  return <section className="panel"><div className="panel-title"><div><p className="kicker">MIS VIAJES</p><h2>Reservas</h2></div><span className="subtle-count">{data?.length ?? "—"} reservas</span></div>{error && <p className="error-text" role="alert">{error}</p>}{!data && !error && <p role="status">Cargando reservas…</p>}{data?.length === 0 && <p className="empty-inline">Todavía no tenés reservas.</p>}<div className="record-grid">{data?.map((row) => <article className="record-card" key={row.code}><strong>{row.code}</strong><p>{row.flightId} · {row.passenger}</p><p>{row.seats} pasaje(s) · {row.cabin} · {money(row.amount)}</p><p><Status value={row.status} /></p><div className="action-row">{row.status === "Pendiente de pago" && <Link className="button small" href={`/pasajero/pago?reservation=${row.code}`}>Pagar prueba</Link>}{live && row.status !== "Cancelada" && !row.passengers?.some((person) => person.checked_in_at) && <button className="button small" type="button" onClick={() => cancel(row.code)}>Cancelar</button>}{row.passengers?.some((person) => person.checked_in_at) && <span className="muted">Check-in realizado</span>}</div></article>)}</div>{message && <p role="status" className="form-status">{message}</p>}</section>;
}

function Profile({ live }: { live: boolean }) {
  const { data, error, refresh } = useMock<{ name: string; email: string; phone: string; document: string }>("profile");
  const [message, setMessage] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/data/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json();
    setMessage(response.ok ? "Perfil actualizado en Supabase." : body.error);
    if (response.ok) refresh();
  }
  if (!live) return <GenericCollection resource="profile" live={false} />;
  return <section className="panel"><div className="panel-title"><div><p className="kicker">MIS DATOS</p><h2>Perfil personal</h2></div></div>{error && <p role="alert" className="error-text">{error}</p>}{!data && !error && <p role="status">Cargando perfil…</p>}{data && <form className="stack-form" onSubmit={save} key={JSON.stringify(data)}><label>Correo electrónico<input value={data.email} disabled /></label><label>Nombre completo<input name="name" defaultValue={data.name} required /></label><label>Documento<input name="document" defaultValue={data.document ?? ""} /></label><label>Teléfono<input name="phone" defaultValue={data.phone ?? ""} /></label><button className="button dark">Guardar perfil</button></form>}{message && <p role="status" className="form-status">{message}</p>}</section>;
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
  const actions = role === "admin" ? [{ label: "Ver vuelos", href: "/admin/vuelos" }, { label: "Capacidades", href: "/admin/capacidades" }, { label: "Tarifas", href: "/admin/tarifas" }] : role === "mostrador" ? [{ label: "Manifiesto", href: "/mostrador/manifiesto" }, { label: "Hacer check-in", href: "/mostrador/check-in" }] : [{ label: "Buscar vuelos", href: "/pasajero/buscar-vuelos" }, { label: "Mi perfil", href: "/pasajero/perfil" }, ...(sprint >= 2 ? [{ label: "Mis reservas", href: "/pasajero/mis-reservas" }] : [])];
  return <><div className="welcome-banner"><div><p className="kicker light">BIENVENIDO A SIGV</p><h2>{role === "admin" ? "Operación aérea, en un solo panel." : role === "mostrador" ? "Cada embarque, bajo control." : "Tu próximo destino está más cerca."}</h2><p>{live ? "Consultá la operación con datos del proyecto SIGV." : "Revisá los flujos de la aerolínea con información de prueba."}</p></div><span aria-hidden="true">✈</span></div><div className="metrics"><div><span>Vuelos programados</span><strong>{data?.flights ?? "—"}</strong></div><div><span>Vuelos activos</span><strong>{data?.activeFlights ?? "—"}</strong></div><div><span>Reservas</span><strong>{data?.reservations ?? "—"}</strong></div></div><section className="panel"><p className="kicker">ACCESOS RÁPIDOS</p><h2>Continuar</h2><div className="shortcut-grid">{actions.map((action) => <Link href={action.href} key={action.href}>{action.label}<span>→</span></Link>)}</div></section></>;
}

export function ModuleContent({ module, sprint, initialFlight, initialQuery, live }: { module: Module; sprint: number; initialFlight?: string; initialQuery: { origin: string; destination: string; date: string; reservation: string }; live: boolean }) {
  if (module.slug === "inicio") return <Dashboard module={module} sprint={sprint} live={live} />;
  if (module.role === "pasajero" && module.slug === "buscar-vuelos") return <SearchFlights sprint={sprint} initialQuery={initialQuery} live={live} />;
  if (module.role === "admin" && module.slug === "vuelos") return <AdminFlights sprint={sprint} live={live} />;
  if (module.slug === "compra") return <Booking initialFlight={initialFlight} live={live} />;
  if (module.slug === "pago") return <Payment reservationCode={initialQuery.reservation} live={live} />;
  if (module.slug === "mis-reservas") return <Reservations live={live} />;
  if (module.slug === "perfil") return <Profile live={live} />;
  if (module.slug === "check-in") return <CheckIn live={live} />;
  if (module.slug === "reportes") return <Reports live={live} />;
  if (module.role === "pasajero" && module.slug === "tickets" && live) return <Tickets />;
  if (live && ["aircraft", "schedules", "frequencies", "configurations", "seats"].includes(module.resource)) return <DomainManager resource={module.resource as "aircraft" | "schedules" | "frequencies" | "configurations" | "seats"} canEdit={module.role === "admin"} />;
  if (["airports", "capacities", "fares", "disruptions", "users", "notifications"].includes(module.resource)) return <ResourceManager resource={module.resource as EditableResource} live={live} />;
  return <GenericCollection resource={module.resource} live={live} />;
}
