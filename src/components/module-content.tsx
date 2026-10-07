"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { findModule, type Module } from "@/lib/catalog";
import { PassengerBooking, type BookingQuery } from "./passenger-booking";
import { DomainManager } from "./domain-manager";
import { AdminFlights } from "./admin-flights";
import { ActionNotice, type Notice } from "./action-notice";
import { mutate } from "@/lib/mutations";


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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || paid) return;
    setBusy(true);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (returnReservation) data.returnReservationCode = returnReservation;
    setMessage(null);
    const result = await mutate("payments", "POST", data);
    setPaid(result.ok);
    setBusy(false);
    setMessage({ ok: result.ok, text: result.ok ? `Pago de prueba aprobado · comprobante ${result.data.invoice}${result.data.returnPayment ? ` · Vuelta ${result.data.returnPayment.invoice}` : ""}. ${live ? "Pago registrado." : "No se guardaron datos."} No se procesó dinero.` : result.error });
  }
  return <div className="two-column"><section className="panel"><p className="kicker">PASO 2 DE 2</p><h2>Pago de prueba</h2><form className="stack-form" onSubmit={submit}><label>Código de reserva de ida<input name="reservationCode" placeholder="SIGV-..." defaultValue={reservationCode} readOnly={Boolean(returnReservation)} required /></label>{returnReservation && <label>Código de reserva de vuelta<input value={returnReservation} readOnly /></label>}<label>Método de pago<select name="method"><option>Tarjeta de prueba</option><option>Transferencia de prueba</option></select></label><button className="button dark" disabled={busy || paid}>{busy ? "Procesando…" : paid ? "Pago aprobado" : "Simular pago"}</button></form><ActionNotice notice={message} />{paid && <div className="action-row"><Link className="button small" href="/pasajero/mis-reservas">Ver mis reservas</Link><Link className="button small" href="/pasajero/buscar-vuelos">Buscar otro vuelo</Link></div>}</section><aside className="panel summary-panel"><h2>Sin cobros reales</h2><p>El pago de prueba confirma {returnReservation ? "los dos tramos de tu viaje" : "tu reserva"}. No se procesa dinero.</p></aside></div>;
}

function CheckIn({ live }: { live: boolean }) {
  const [message, setMessage] = useState<Notice>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    setMessage(null);
    const result = await mutate("check-in", "POST", payload);
    setMessage({ ok: result.ok, text: result.ok ? `Check-in ${live ? "registrado" : "simulado"} · asiento ${result.data.seat} · pase ${result.data.boardingPass}` : result.error });
  }
  return <div className="two-column"><section className="panel"><p className="kicker">ATENCIÓN PRESENCIAL</p><h2>Registrar check-in</h2><form className="stack-form" onSubmit={submit}><label>Código de reserva<input name="reservationCode" placeholder="SIGV-..." required /></label>{live && <label>Documento del pasajero<input name="document" required /></label>}<div className="form-row"><label>Asiento<input name="seat" placeholder="Ej. 3A Economy / 1A Primera" pattern="[0-9]{1,2}[A-Fa-f]" required /></label><label>Equipaje en bodega (kg)<input type="number" name="baggageKg" min="0" max="40" step="0.1" defaultValue="0" required /></label></div><button className="button dark">Registrar check-in</button></form><ActionNotice notice={message} /></section><aside className="panel summary-panel"><h2>Verificación de mostrador</h2><p>{live ? "La reserva, el documento, la cabina, la disponibilidad del asiento y el equipaje se comprueban en Supabase antes de registrar el pase." : "Datos de prueba para recorrer el proceso."}</p></aside></div>;
}

type EditableRow = Record<string, string | number | null>;
type EditableResource = "airports" | "capacities" | "fares" | "disruptions" | "users" | "notifications";

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
  const { data, error, refresh } = useMock<{ name: string; email: string; phone: string; document: string }>("profile");
  const [message, setMessage] = useState<Notice>(null);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    setMessage(null);
    const result = await mutate("profile", "PATCH", payload);
    setMessage({ ok: result.ok, text: result.ok ? "Perfil actualizado correctamente." : result.error });
    if (result.ok) refresh();
  }
  if (!live) return <GenericCollection resource="profile" live={false} />;
  return <section className="panel"><div className="panel-title"><div><p className="kicker">MIS DATOS</p><h2>Perfil personal</h2></div></div>{error && <p role="alert" className="error-text">{error}</p>}{!data && !error && <p role="status">Cargando perfil…</p>}{data && <form className="stack-form" onSubmit={save} key={JSON.stringify(data)}><label>Correo electrónico<input value={data.email} disabled /></label><label>Nombre completo<input name="name" defaultValue={data.name} required /></label><label>Documento<input name="document" defaultValue={data.document ?? ""} /></label><label>Teléfono<input name="phone" defaultValue={data.phone ?? ""} /></label><button className="button dark">Guardar perfil</button></form>}<ActionNotice notice={message} /></section>;
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
  if (module.slug === "reportes") return <Reports live={live} />;
  if (module.role === "pasajero" && module.slug === "tickets" && live) return <Tickets />;
  if (live && ["aircraft", "schedules", "frequencies", "configurations", "seats"].includes(module.resource)) return <DomainManager resource={module.resource as "aircraft" | "schedules" | "frequencies" | "configurations" | "seats"} canEdit={module.role === "admin"} />;
  if (["airports", "capacities", "fares", "disruptions", "users", "notifications"].includes(module.resource)) return <ResourceManager resource={module.resource as EditableResource} live={live} />;
  return <GenericCollection resource={module.resource} live={live} />;
}
