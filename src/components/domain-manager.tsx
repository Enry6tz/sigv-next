"use client";

import { useEffect, useState, type FormEvent } from "react";

type DomainResource = "aircraft" | "schedules" | "frequencies" | "configurations" | "seats";
type Row = Record<string, string | number | null>;

const title: Record<DomainResource, string> = {
  aircraft: "Aviones", schedules: "Programaciones", frequencies: "Frecuencias",
  configurations: "Configuración por clase", seats: "Asientos",
};
const weekdays = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function DomainManager({ resource, canEdit }: { resource: DomainResource; canEdit: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [aircraft, setAircraft] = useState<Row[]>([]);
  const [schedules, setSchedules] = useState<Row[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState<Row | null>(null);

  useEffect(() => {
    let active = true;
    if (resource === "seats" && !filter.trim()) return () => { active = false; };
    const endpoint = resource === "seats" && filter ? `seats?flightId=${encodeURIComponent(filter)}` : resource;
    fetch(`/api/data/${endpoint}`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo cargar");
      if (active) { setRows(body.data); setError(""); }
    }).catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [resource, filter, revision]);

  const visibleRows = resource === "seats" && !filter.trim() ? [] : rows;

  useEffect(() => {
    if (!canEdit) return;
    if (resource === "schedules") fetch("/api/data/aircraft", { cache: "no-store" }).then((r) => r.json()).then((b) => setAircraft(b.data ?? []));
    if (["frequencies", "configurations"].includes(resource)) fetch("/api/data/schedules", { cache: "no-store" }).then((r) => r.json()).then((b) => setSchedules(b.data ?? []));
  }, [resource, canEdit, revision]);

  async function send(method: "POST" | "PATCH" | "DELETE", payload: Record<string, unknown>) {
    const response = await fetch(`/api/data/${resource}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json();
    setMessage(response.ok ? resource === "schedules" && payload.action === "generate"
      ? `${body.data.created} vuelos generados.` : "Cambios guardados en Supabase." : body.error ?? "No se pudo guardar");
    if (response.ok) { setEditing(null); setCreating(false); setGenerating(null); setRevision((value) => value + 1); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: Record<string, unknown> = Object.fromEntries(new FormData(event.currentTarget));
    if (editing) {
      if (resource === "aircraft" || resource === "schedules" || resource === "seats") payload.id = editing.id;
      if (resource === "configurations") { payload.scheduleId = editing.scheduleId; payload.cabin = editing.cabin; }
    }
    void send(creating ? "POST" : "PATCH", payload);
  }

  function formFields() {
    if (resource === "aircraft") return <>
      <label>Modelo<input name="model" defaultValue={String(editing?.model ?? "")} required /></label>
      <label>Matrícula<input name="registration" defaultValue={String(editing?.registration ?? "")} required /></label>
      <div className="form-row"><label>Capacidad Economy<input name="capacityEconomy" type="number" min="0" step="1" defaultValue={Number(editing?.capacityEconomy ?? 0)} required /></label>
      <label>Capacidad Primera<input name="capacityFirst" type="number" min="0" max="12" step="1" defaultValue={Number(editing?.capacityFirst ?? 0)} required /></label></div>
      {!creating && <label>Estado<select name="status" defaultValue={String(editing?.status ?? "Activa")}><option>Activa</option><option>Mantenimiento</option><option>Fuera de servicio</option></select></label>}
    </>;
    if (resource === "schedules") return <>
      {creating && <label>Código de vuelo<input name="code" placeholder="AR-1000" required /></label>}
      <div className="form-row"><label>Origen IATA<input name="origin" defaultValue={String(editing?.origin ?? "")} required /></label><label>Destino IATA<input name="destination" defaultValue={String(editing?.destination ?? "")} required /></label></div>
      <label>Avión<select name="aircraftId" defaultValue={String(editing?.aircraftId ?? "")} required><option value="">Seleccioná un avión</option>{aircraft.filter((row) => !row.archivedAt).map((row) => <option key={String(row.id)} value={String(row.id)}>{row.registration} · {row.model}</option>)}</select></label>
      <div className="form-row"><label>Salida<input name="departure" type="time" defaultValue={String(editing?.departure ?? "")} required /></label><label>Llegada<input name="arrival" type="time" defaultValue={String(editing?.arrival ?? "")} required /></label></div>
      <div className="form-row"><label>Venta desde<input name="saleStart" type="date" defaultValue={String(editing?.saleStart ?? "")} required /></label><label>Venta hasta<input name="saleEnd" type="date" defaultValue={String(editing?.saleEnd ?? "")} required /></label></div>
      {!creating && <label>Estado<select name="status" defaultValue={String(editing?.status ?? "Activa")}><option>Activa</option><option>Suspendida</option></select></label>}
    </>;
    if (resource === "frequencies") return <><label>Programación<select name="scheduleId" required><option value="">Seleccioná</option>{schedules.filter((row) => !row.archivedAt).map((row) => <option key={String(row.id)} value={String(row.id)}>{row.code} · {row.origin} → {row.destination}</option>)}</select></label>
      <label>Día<select name="weekday">{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label></>;
    if (resource === "configurations") return <>{creating && <><label>Programación<select name="scheduleId" required><option value="">Seleccioná</option>{schedules.filter((row) => !row.archivedAt).map((row) => <option key={String(row.id)} value={String(row.id)}>{row.code}</option>)}</select></label>
      <label>Cabina<select name="cabin"><option>Economy</option><option>Primera</option></select></label></>}
      <div className="form-row"><label>Capacidad<input name="capacity" type="number" min="0" step="1" defaultValue={Number(editing?.capacity ?? 0)} required /></label><label>Tarifa base<input name="price" type="number" min="0" step="0.01" defaultValue={Number(editing?.price ?? 0)} required /></label></div></>;
    return null;
  }

  return <section className="panel"><div className="panel-title"><div><p className="kicker">MODELO OPERATIVO</p><h2>{title[resource]}</h2></div>{canEdit && resource !== "seats" && <button className="button dark" type="button" onClick={() => { setCreating(true); setEditing(null); }}>+ Agregar</button>}</div>
    {resource === "seats" && <label className="search-field">Filtrar por vuelo<input value={filter} onChange={(event) => setFilter(event.target.value.toUpperCase())} placeholder="Ej. AR-1420" /></label>}
    {error && <p role="alert" className="error-text">{error}</p>}{!visibleRows && !error && <p role="status">Cargando…</p>}{visibleRows?.length === 0 && <p className="empty-inline">{resource === "seats" && !filter ? "Ingresá un código de vuelo para ver sus asientos." : "Todavía no hay registros."}</p>}
    <div className="record-grid">{visibleRows?.map((row, index) => <article className="record-card" key={`${resource}-${String(row.id ?? row.scheduleId ?? index)}-${String(row.weekday ?? row.cabin ?? "")}`}>
      <strong>{resource === "aircraft" ? String(row.registration) : resource === "schedules" ? String(row.code) : resource === "seats" ? `${row.flightId} · ${row.code}` : resource === "frequencies" ? `${schedules.find((item) => item.id === row.scheduleId)?.code ?? row.scheduleId} · ${weekdays[Number(row.weekday)]}` : `${schedules.find((item) => item.id === row.scheduleId)?.code ?? row.scheduleId} · ${row.cabin}`}</strong>
      {Object.entries(row).filter(([key]) => !["id", "scheduleId", "code", "registration", "flightId", "weekday", "cabin"].includes(key)).slice(0, 7).map(([key, value]) => <p key={key}>{key}: {value === null ? "—" : String(value)}</p>)}
      {canEdit && <div className="action-row">
        {!["frequencies", "seats"].includes(resource) && <button className="button small" type="button" onClick={() => { setEditing(row); setCreating(false); }}>Editar</button>}
        {["aircraft", "schedules"].includes(resource) && <button className="button small" type="button" onClick={() => void send(row.archivedAt ? "PATCH" : "DELETE", row.archivedAt ? { id: row.id, restore: true } : { id: row.id })}>{row.archivedAt ? "Restaurar" : "Archivar"}</button>}
        {["frequencies", "configurations"].includes(resource) && <button className="button small" type="button" onClick={() => void send("DELETE", { scheduleId: row.scheduleId, weekday: row.weekday, cabin: row.cabin })}>Quitar</button>}
        {resource === "schedules" && !row.archivedAt && <button className="button small" type="button" onClick={() => setGenerating(row)}>Generar vuelos</button>}
        {resource === "seats" && row.status !== "Ocupado" && <button className="button small" type="button" onClick={() => void send("PATCH", { id: row.id, status: row.status === "Bloqueado" ? "Disponible" : "Bloqueado" })}>{row.status === "Bloqueado" ? "Liberar" : "Bloquear"}</button>}
      </div>}
    </article>)}</div>
    {(editing || creating) && resource !== "seats" && <form className="stack-form inline-form" onSubmit={submit} key={`${resource}-${String(editing?.id ?? editing?.scheduleId ?? "new")}`}><h3>{creating ? "Nuevo registro" : "Editar registro"}</h3>{formFields()}<div className="action-row"><button className="button dark" type="submit">Guardar</button><button className="button" type="button" onClick={() => { setEditing(null); setCreating(false); }}>Cerrar</button></div></form>}
    {generating && <form className="stack-form inline-form" onSubmit={(event) => { event.preventDefault(); void send("POST", { action: "generate", scheduleId: generating.id, ...Object.fromEntries(new FormData(event.currentTarget)) }); }}><h3>Generar vuelos de {generating.code}</h3><div className="form-row"><label>Desde<input type="date" name="from" defaultValue={String(generating.saleStart)} required /></label><label>Hasta<input type="date" name="to" defaultValue={String(generating.saleEnd)} required /></label></div><div className="action-row"><button className="button dark" type="submit">Generar</button><button className="button" type="button" onClick={() => setGenerating(null)}>Cerrar</button></div></form>}
    {message && <p role="status" className="form-status">{message}</p>}
  </section>;
}
