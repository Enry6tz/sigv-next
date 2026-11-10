"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ActionNotice, type Notice } from "./action-notice";
import { FilterBar, FilterInput, SearchSelect } from "./workspace-filters";
import { domainStatus, emptyDomainFilters, filterDomainRows, seatFlightOptions, type DomainFilters, type DomainRow as Row } from "@/lib/domain-filters";
import { matchesFilter, uniqueOptions } from "@/lib/filter-options";
import { mutate } from "@/lib/mutations";

type DomainResource = "aircraft" | "schedules" | "frequencies" | "configurations" | "seats";
type LoadedRows = { endpoint: string; rows: Row[]; error: string };

const title: Record<DomainResource, string> = {
  aircraft: "Aviones", schedules: "Programaciones", frequencies: "Frecuencias",
  configurations: "Configuración por clase", seats: "Asientos",
};
const weekdays = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const dayOptions = [{ value: "", label: "Todos los días" }, ...weekdays.map((label, day) => ({ value: String(day), label }))];
const cabinOptions = [{ value: "", label: "Todas las cabinas" }, { value: "Economy", label: "Economy" }, { value: "Primera", label: "Primera" }];

async function readRows(endpoint: string, signal: AbortSignal): Promise<Row[]> {
  const response = await fetch(`/api/data/${endpoint}`, { cache: "no-store", signal });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "No se pudo cargar.");
  return body.data ?? [];
}

type DomainManagerProps = { resource: DomainResource; canEdit: boolean };

export function DomainManager(props: DomainManagerProps) {
  return <DomainResourcePanel key={props.resource} {...props} />;
}

function DomainResourcePanel({ resource, canEdit }: DomainManagerProps) {
  const [result, setResult] = useState<LoadedRows | null>(null);
  const [lookup, setLookup] = useState<LoadedRows | null>(null);
  const [filters, setFilters] = useState(emptyDomainFilters);
  const [query, setQuery] = useState("");
  const [flightDate, setFlightDate] = useState("");
  const [message, setMessage] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState<Row | null>(null);

  const endpoint = resource === "seats"
    ? filters.flightId ? `seats?flightId=${encodeURIComponent(filters.flightId)}` : ""
    : resource;
  const lookupEndpoint = resource === "seats" ? "flights"
    : resource === "frequencies" || resource === "configurations" ? "schedules"
      : resource === "schedules" && canEdit ? "aircraft" : "";

  useEffect(() => {
    if (!endpoint) return;
    const controller = new AbortController();
    readRows(endpoint, controller.signal).then((rows) => {
      if (!controller.signal.aborted) setResult({ endpoint, rows, error: "" });
    }).catch((reason) => {
      if (!controller.signal.aborted) setResult({ endpoint, rows: [], error: reason.message });
    });
    return () => controller.abort();
  }, [endpoint, revision]);

  useEffect(() => {
    if (!lookupEndpoint) return;
    const controller = new AbortController();
    readRows(lookupEndpoint, controller.signal).then((rows) => {
      if (!controller.signal.aborted) setLookup({ endpoint: lookupEndpoint, rows, error: "" });
    }).catch((reason) => {
      if (!controller.signal.aborted) setLookup({ endpoint: lookupEndpoint, rows: [], error: reason.message });
    });
    return () => controller.abort();
  }, [lookupEndpoint, revision]);

  const currentResult = result?.endpoint === endpoint ? result : null;
  const currentLookup = lookup?.endpoint === lookupEndpoint ? lookup : null;
  const rows = currentResult?.rows;
  const aircraft = lookupEndpoint === "aircraft" ? currentLookup?.rows ?? [] : [];
  const schedules = lookupEndpoint === "schedules" ? currentLookup?.rows ?? [] : [];
  const flights = lookupEndpoint === "flights" ? currentLookup?.rows ?? [] : [];
  const flightOptions = seatFlightOptions(flights, flightDate);
  const scheduleById = new Map(schedules.map((row) => [String(row.id), row]));
  const scheduleOptions = uniqueOptions([filters.scheduleId, ...(rows ?? []).map((row) => row.scheduleId)]).map((option) => {
    const schedule = scheduleById.get(option.value);
    return { ...option, label: schedule ? `${schedule.code} · ${schedule.origin} → ${schedule.destination}` : option.label };
  });
  const dateError = !!filters.from && !!filters.to && filters.from > filters.to;
  const hasFilters = Object.values(filters).some(Boolean) || Boolean(query || flightDate);
  const visibleRows = filterDomainRows(rows ?? [], filters).filter((row) =>
    resource === "aircraft" ? matchesFilter(query, row.registration, row.model)
      : resource === "schedules" ? matchesFilter(query, row.code, row.origin, row.destination)
        : resource === "seats" ? matchesFilter(query, row.code) : true);

  function changeFilter(key: keyof DomainFilters, value: string) {
    setFilters((previous) => ({ ...previous, [key]: value }));
  }

  function changeFlightDate(date: string) {
    setFlightDate(date);
    if (date && !flights.some((flight) => flight.id === filters.flightId && flight.date === date)) {
      changeFilter("flightId", "");
    }
  }

  function clearFilters() {
    setFilters(emptyDomainFilters);
    setQuery("");
    setFlightDate("");
  }

  function filterControls() {
    const states = [{ value: "", label: "Todos los estados" }, ...uniqueOptions([filters.status, ...(rows ?? []).map(domainStatus)])];
    return <FilterBar label={`Filtros de ${title[resource].toLowerCase()}`}>
      {resource === "aircraft" && <FilterInput label="Buscar avión" value={query} onChange={setQuery} placeholder="Matrícula o modelo" />}
      {resource === "schedules" && <>
        <FilterInput label="Buscar programación" value={query} onChange={setQuery} placeholder="Código o aeropuerto" />
        <SearchSelect label="Origen" value={filters.origin} onChange={(value) => changeFilter("origin", value)}
          options={[{ value: "", label: "Todos los orígenes" }, ...uniqueOptions([filters.origin, ...(rows ?? []).map((row) => row.origin)])]} />
        <SearchSelect label="Destino" value={filters.destination} onChange={(value) => changeFilter("destination", value)}
          options={[{ value: "", label: "Todos los destinos" }, ...uniqueOptions([filters.destination, ...(rows ?? []).map((row) => row.destination)])]} />
        <FilterInput label="Venta desde" type="date" value={filters.from} onChange={(value) => changeFilter("from", value)} />
        <FilterInput label="Venta hasta" type="date" value={filters.to} onChange={(value) => changeFilter("to", value)} />
      </>}
      {(resource === "frequencies" || resource === "configurations") &&
        <SearchSelect label="Programación" value={filters.scheduleId} onChange={(value) => changeFilter("scheduleId", value)}
          options={[{ value: "", label: "Todas las programaciones" }, ...scheduleOptions]} />}
      {resource === "frequencies" &&
        <SearchSelect label="Día" value={filters.weekday} onChange={(value) => changeFilter("weekday", value)} options={dayOptions} />}
      {resource === "seats" && <>
        <FilterInput label="Fecha de vuelo" type="date" value={flightDate} onChange={changeFlightDate} />
        <SearchSelect label="Vuelo" value={filters.flightId} onChange={(value) => changeFilter("flightId", value)}
          disabled={!currentLookup || !!currentLookup.error}
          options={[{ value: "", label: "Seleccioná un vuelo" }, ...flightOptions]} />
        {filters.flightId && <FilterInput label="Buscar asiento" value={query} onChange={setQuery} placeholder="Ej. 12A" />}
      </>}
      {(resource === "configurations" || (resource === "seats" && !!filters.flightId)) &&
        <SearchSelect label="Cabina" value={filters.cabin} onChange={(value) => changeFilter("cabin", value)} options={cabinOptions} />}
      {(resource === "aircraft" || resource === "schedules" || (resource === "seats" && !!filters.flightId)) &&
        <SearchSelect label="Estado" value={filters.status} onChange={(value) => changeFilter("status", value)} options={states} />}
      {hasFilters && <button className="button small" type="button" onClick={clearFilters}>Limpiar filtros</button>}
    </FilterBar>;
  }

  async function send(method: "POST" | "PATCH" | "DELETE", payload: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setMessage(null);
    const result = await mutate(resource, method, payload);
    setMessage({ ok: result.ok, text: result.ok ? resource === "schedules" && payload.action === "generate"
      ? `${result.data.created} vuelos generados correctamente.` : "Cambios guardados correctamente." : result.error });
    if (result.ok) { setEditing(null); setCreating(false); setGenerating(null); setRevision((value) => value + 1); }
    setBusy(false);
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
    {filterControls()}
    {resource === "schedules" && <p className="form-hint">Las fechas buscan programaciones cuyo período de venta coincide con el rango.</p>}
    {dateError && <p role="alert" className="error-text">La fecha desde no puede ser posterior a la fecha hasta.</p>}
    {currentLookup?.error && <p role="alert" className="error-text">No se pudieron cargar las opciones: {currentLookup.error}</p>}
    {currentResult?.error && <p role="alert" className="error-text">{currentResult.error}</p>}
    {((endpoint && !currentResult) || (resource === "seats" && !currentLookup)) && <p role="status">Cargando…</p>}
    {resource === "seats" && !filters.flightId && currentLookup && !currentLookup.error &&
      <p className="empty-inline">{flightOptions.length ? "Seleccioná un vuelo para consultar sus asientos." : "No hay vuelos para la fecha seleccionada."}</p>}
    {currentResult && !currentResult.error && !dateError && !visibleRows.length &&
      <p className="empty-inline">{rows?.length ? "Ningún registro coincide con los filtros." : "Todavía no hay registros."}</p>}
    <div className="record-grid">{visibleRows.map((row, index) => <article className="record-card" key={`${resource}-${String(row.id ?? row.scheduleId ?? index)}-${String(row.weekday ?? row.cabin ?? "")}`}>
      <strong>{resource === "aircraft" ? String(row.registration) : resource === "schedules" ? String(row.code) : resource === "seats" ? `${row.flightId} · ${row.code}` : resource === "frequencies" ? `${scheduleById.get(String(row.scheduleId))?.code ?? row.scheduleId} · ${weekdays[Number(row.weekday)]}` : `${scheduleById.get(String(row.scheduleId))?.code ?? row.scheduleId} · ${row.cabin}`}</strong>
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
    <ActionNotice notice={message} />
  </section>;
}
