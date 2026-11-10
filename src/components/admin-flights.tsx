"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { filterAdminFlights, frequencyLabel, type AdminFlight } from "@/lib/admin-flights";
import { uniqueOptions } from "@/lib/filter-options";
import { mutate } from "@/lib/mutations";
import { FlightCreateForm } from "./flight-create-form";
import { ActionNotice, type Notice } from "./action-notice";
import { FilterBar, FilterInput, SearchSelect } from "./workspace-filters";

function FlightDialog({ children, label, busy, onClose }: { children: ReactNode; label: string; busy: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    if (dialog?.querySelector("fieldset:disabled")) {
      dialog.focus();
      dialog.scrollTo({ top: 0 });
    }
    return () => dialog?.close();
  }, []);
  return <dialog className="admin-flight-dialog" ref={ref} tabIndex={-1} aria-label={label} onCancel={(event) => {
    event.preventDefault(); if (!busy) onClose();
  }}>{children}</dialog>;
}

function RowIcon({ action }: { action: "edit" | "fares" | "delete" }) {
  if (action === "fares") return <span aria-hidden="true">$</span>;
  return <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    {action === "edit" ? <><path d="m15 4 5 5-11 11H4v-5Z" /><path d="m12 7 5 5" /></> : <><path d="m7 7 10 10M17 7 7 17" /></>}
  </svg>;
}

const shortDate = (value: string) => value.split("-").reverse().map((part, index) => index === 2 ? part.slice(-2) : part).join("/");
const pageSize = 7;
const emptyFilter = { code: "", origin: "", destination: "", date: "", kind: "" };
const allAirports = { value: "", label: "Todos" };
const flightKinds = [
  { value: "", label: "Todos" },
  { value: "schedule", label: "Programaciones" },
  { value: "standalone", label: "Vuelos individuales" },
];

export function AdminFlights({ live }: { live: boolean }) {
  const [rows, setRows] = useState<AdminFlight[] | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState(emptyFilter);
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{ action: "create" | "edit" | "fares" | "delete"; flight?: AdminFlight } | null>(null);
  const [message, setMessage] = useState<Notice>(null);
  const [deleted, setDeleted] = useState<AdminFlight | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/data/admin-flights?includeStandalone=1", { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo cargar el listado de vuelos.");
      if (active) { setRows(body.data); setError(""); }
    }).catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [revision]);

  const filtered = filterAdminFlights(rows ?? [], filter.code, filter.origin, filter.destination, filter);
  const standaloneCount = rows?.filter((row) => row.kind === "standalone").length ?? 0;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const changeFilter = (key: keyof typeof filter, value: string) => { setFilter((current) => ({ ...current, [key]: value })); setPage(1); };
  const open = (action: "create" | "edit" | "fares" | "delete", flight?: AdminFlight) => {
    setDialogError(""); setMessage(null); setDialog({ action, flight });
  };
  const finish = (text: string) => { setMessage({ ok: true, text }); setDialog(null); setRevision((value) => value + 1); };

  async function remove() {
    const flight = dialog?.flight;
    if (!flight || busy) return;
    setBusy(true); setDialogError("");
    const result = await mutate("admin-flights", "DELETE", { id: flight.id });
    if (result.ok) {
      setDeleted(live ? flight : null);
      finish(live ? `Vuelo ${flight.code} eliminado del listado.` : "Eliminación simulada. No se guardaron datos.");
    } else setDialogError(result.error);
    setBusy(false);
  }

  async function restore() {
    if (!deleted || busy) return;
    setBusy(true);
    const result = await mutate("admin-flights", "PATCH", { id: deleted.id, restore: true });
    if (result.ok) { finish(`Vuelo ${deleted.code} restaurado.`); setDeleted(null); }
    else setMessage({ ok: false, text: result.error });
    setBusy(false);
  }

  async function saveFares(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog?.flight || busy) return;
    setBusy(true); setDialogError("");
    const result = await mutate("admin-flights", "PATCH", { id: dialog.flight.id, action: "fares", ...Object.fromEntries(new FormData(event.currentTarget)) });
    if (result.ok) finish(live ? "Tarifas actualizadas correctamente." : "Edición simulada. No se guardaron datos.");
    else setDialogError(result.error);
    setBusy(false);
  }

  return <section className="admin-flight-list" aria-label="Listado de vuelos">
    <div className="admin-flight-toolbar">
      <span className="admin-flight-count">{rows ? `${rows.length - standaloneCount} programaciones · ${standaloneCount} vuelos individuales` : "Listado de vuelos"}</span>
      <button className="button" type="button" disabled={busy} onClick={() => setRevision((value) => value + 1)}>Actualizar</button>
      <button className="button dark" disabled={busy} onClick={() => open("create")}>+ Crear Nuevo Vuelo</button>
      <FilterBar label="Filtros del listado de vuelos">
        <FilterInput label="Buscar código de vuelo" value={filter.code} onChange={(value) => changeFilter("code", value)} placeholder="Ej. AR-9519" />
        {(["origin", "destination"] as const).map((key) => <SearchSelect key={key}
          label={key === "origin" ? "Origen" : "Destino"} value={filter[key]} onChange={(value) => changeFilter(key, value)}
          options={[allAirports, ...uniqueOptions((rows ?? []).map((row) => row[key]))]} />)}
        <SearchSelect label="Tipo" value={filter.kind} options={flightKinds} onChange={(value) => changeFilter("kind", value)} />
        <FilterInput label="Fecha de vuelo" type="date" value={filter.date} onChange={(value) => changeFilter("date", value)} />
        <button className="button" type="button" onClick={() => { setFilter(emptyFilter); setPage(1); }}>Limpiar filtros</button>
      </FilterBar>
    </div>
    <div className="admin-flight-results">
      <ActionNotice notice={message} />{deleted && <button className="button small" disabled={busy} onClick={restore}>Deshacer eliminación de {deleted.code}</button>}
      {error ? <div role="alert" className="error-text"><p>{error}</p><button className="button" onClick={() => setRevision((value) => value + 1)}>Reintentar</button></div> : !rows ? <p role="status">Cargando vuelos…</p> : <>
        <div className="admin-flight-table-wrap" tabIndex={0} role="region" aria-label="Tabla de vuelos, desplazamiento horizontal disponible"><table className="admin-flight-table"><thead><tr>
          <th scope="col">Código vuelo</th><th scope="col">Origen → Destino</th><th scope="col">Aeronave</th><th scope="col">Frecuencia</th><th scope="col">Fecha o período</th><th scope="col">Estado</th><th scope="col">Acciones</th>
        </tr></thead><tbody>{visible.map((flight) => <tr key={`${flight.kind ?? "schedule"}-${flight.id}`}>
          <td><strong>{flight.code}</strong></td><td>{flight.origin} → {flight.destination}</td><td>{flight.aircraftModel ?? "Sin asignar"}</td>
          <td>{flight.kind === "standalone" ? "Vuelo individual" : frequencyLabel(flight.weekdays)}</td>
          <td>{flight.kind === "standalone" ? `${shortDate(flight.saleStart)} · ${flight.departure}` : `${shortDate(flight.saleStart)} — ${shortDate(flight.saleEnd)}`}</td>
          <td><span className={`admin-flight-status${flight.status === "Activa" ? " active" : ""}`}><span aria-hidden="true">●</span>{flight.operationalStatus ?? (flight.status === "Activa" ? "Activo" : "Inactivo")}</span></td>
          <td>{flight.kind === "standalone" ? <Link className="inline-action" href="/admin/contingencias" aria-label={`Contingencias del vuelo ${flight.code}`}>Contingencias</Link>
            : <div className="admin-flight-actions">{(["edit", "fares", "delete"] as const).map((action) => {
            const label = `${action === "edit" ? "Editar" : action === "fares" ? "Tarifas de" : "Eliminar"} vuelo ${flight.code}`;
            return <button key={action} type="button" disabled={busy} aria-label={label} title={label} onClick={() => open(action, flight)}><RowIcon action={action} /></button>;
          })}</div>}</td>
        </tr>)}</tbody></table></div>
        {filtered.length === 0 && <p className="empty-inline">{rows.length ? "No hay vuelos que coincidan con los filtros." : "Todavía no hay vuelos registrados."}</p>}
        <div className="admin-flight-pagination"><span aria-live="polite">{visible.length
          ? `Mostrando ${(currentPage - 1) * pageSize + 1}–${(currentPage - 1) * pageSize + visible.length} de ${filtered.length} registros`
          : "Sin registros para mostrar"}</span><nav aria-label="Páginas del listado de vuelos">
          <button aria-label="Página anterior" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button>
          {Array.from({ length: pages }, (_, index) => index + 1).filter((value) => Math.abs(value - currentPage) <= 2).map((value) => <button key={value} aria-label={`Página ${value}`} aria-current={value === currentPage ? "page" : undefined} onClick={() => setPage(value)}>{value}</button>)}
          <button aria-label="Página siguiente" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>›</button>
        </nav></div>
      </>}
    </div>
    {dialog && <FlightDialog label={dialog.action === "create" ? "Crear nuevo vuelo" : `${dialog.action === "edit" ? "Editar" : dialog.action === "fares" ? "Tarifas de" : "Eliminar"} vuelo ${dialog.flight?.code}`} busy={busy} onClose={() => setDialog(null)}>
      {["create", "edit"].includes(dialog.action) ? <FlightCreateForm live={live} initialFlight={dialog.flight} onCancel={() => setDialog(null)} onBusyChange={setBusy} onSuccess={finish} />
        : dialog.action === "fares" ? <form className="stack-form admin-flight-small-dialog" onSubmit={saveFares}><h2>Tarifas de {dialog.flight?.code}</h2>
          <fieldset disabled={busy}><legend>Precio por clase (ARS)</legend><label>Economy<input name="economy" type="number" min="0" max="9999999999.99" step="0.01" defaultValue={dialog.flight?.economy} required autoFocus /></label>
          <label>Primera Clase<input name="first" type="number" min="0" max="9999999999.99" step="0.01" defaultValue={dialog.flight?.first} required /></label></fieldset>
          <p className="form-hint">Se actualizan las tarifas de esta programación y sus vuelos. Las reservas existentes conservan su precio.</p>
          {dialogError && <p role="alert" className="error-text">{dialogError}</p>}<div className="action-row"><button type="button" className="button" disabled={busy} onClick={() => setDialog(null)}>Cancelar</button><button className="button dark" disabled={busy}>{busy ? "Guardando…" : "Guardar tarifas"}</button></div>
        </form> : <div className="admin-flight-small-dialog"><h2>Eliminar vuelo {dialog.flight?.code}</h2><p>Se quitará del listado y se retirarán de la venta todos los vuelos de esta programación.</p><p>Las reservas vigentes deben cancelarse antes de eliminarlo. Podés deshacer la eliminación.</p>
          {dialogError && <p role="alert" className="error-text">{dialogError}</p>}<div className="action-row"><button className="button" disabled={busy} onClick={() => setDialog(null)} autoFocus>Cancelar</button><button className="button dark" disabled={busy} onClick={remove}>{busy ? "Eliminando…" : "Eliminar vuelo"}</button></div></div>}
    </FlightDialog>}
  </section>;
}
