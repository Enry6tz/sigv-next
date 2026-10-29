"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { buildOccupancyReport, occupancyCsv, reportTotals, type OccupancyRow } from "@/lib/occupancy-report";

const emptyFilters = { flightId: "", cabin: "", from: "", to: "" };
const dateLabel = (value: string) => value.split("-").reverse().join("/");

export function OccupancyReport({ live }: { live: boolean }) {
  const [draft, setDraft] = useState(emptyFilters);
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<OccupancyRow[] | null>(null);
  const [flightOptions, setFlightOptions] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<OccupancyRow | null>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    activeRequest.current = controller;
    fetch(`/api/data/reports${query ? `?${query}` : ""}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo consultar el reporte.");
      if (!controller.signal.aborted) {
        setRows(result.data);
        setFlightOptions((previous) => [...new Set([...previous, ...(result.data as OccupancyRow[]).map((row) => row.flightId)])].sort());
        setError("");
      }
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [query, revision]);

  useEffect(() => { if (selected) detailHeading.current?.focus(); }, [selected]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    activeRequest.current?.abort();
    const params = new URLSearchParams(Object.entries(draft).filter(([, value]) => value));
    setSelected(null);
    try { buildOccupancyReport([], [], params); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Revisa los filtros."); return; }
    setRows(null); setError(""); setQuery(params.toString()); setRevision((value) => value + 1);
  }

  function clear() {
    activeRequest.current?.abort();
    setDraft(emptyFilters); setSelected(null); setRows(null); setError(""); setQuery(""); setRevision((value) => value + 1);
  }

  function closeDetail() {
    setSelected(null);
    detailTrigger.current?.focus();
  }

  function download() {
    if (!rows) return;
    const url = URL.createObjectURL(new Blob([occupancyCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = "SIGV-ocupacion.csv"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const totals = reportTotals(rows ?? []);
  return <section className="panel occupancy-report" aria-labelledby="occupancy-heading">
    <div className="panel-title"><h2 id="occupancy-heading">Reporte de ocupación</h2><span className="subtle-count">{live ? "Datos en línea" : "Datos simulados"}</span></div>
    <form className="occupancy-filters" onSubmit={apply}>
      <label>Vuelo<select value={draft.flightId} onChange={(event) => setDraft({ ...draft, flightId: event.target.value })}><option value="">Todos los vuelos</option>{flightOptions.map((id) => <option key={id}>{id}</option>)}</select></label>
      <label>Clase<select value={draft.cabin} onChange={(event) => setDraft({ ...draft, cabin: event.target.value })}><option value="">Todas las clases</option><option>Economy</option><option>Primera</option></select></label>
      <label>Desde<input type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></label>
      <label>Hasta<input type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></label>
      <div className="action-row"><button className="button dark" type="submit">Aplicar</button><button className="button" type="button" onClick={clear}>Limpiar</button></div>
    </form>
    {error ? <p role="alert" className="error-text">{error}</p> : !rows ? <p role="status">Cargando reporte…</p> : !rows.length ? <p role="status" className="empty-inline">No existen vuelos que coincidan con los filtros. Prueba con otras fechas o limpia la búsqueda.</p> : <>
      <dl className="occupancy-totals" aria-label="Totales del resultado filtrado"><div><dt>Pasajes vendidos</dt><dd>{totals.sold}</dd></div><div><dt>Vuelos incluidos</dt><dd>{totals.flights}</dd></div><div><dt>Ocupación promedio</dt><dd>{totals.average}%</dd></div></dl>
      <p className="form-hint">El promedio es la media de las filas. Ocupación global ponderada por capacidad: {totals.weightedOccupancy}%.</p>
      <div className="action-row">{live ? <a className="button small" href={`/api/reports/occupancy/download${query ? `?${query}` : ""}`} download>Descargar CSV</a> : <button className="button small" type="button" onClick={download}>Descargar CSV de prueba</button>}</div>
      <div className="occupancy-table-scroll"><table className="occupancy-table"><caption>Selecciona una fila para consultar sus pasajes confirmados.</caption><thead><tr><th scope="col">Vuelo</th><th scope="col">Fecha</th><th scope="col">Clase</th><th scope="col">Vendidos</th><th scope="col">Capacidad</th><th scope="col">Ocupación</th></tr></thead><tbody>{rows.map((row) => {
        const open = () => setSelected(row);
        return <tr key={`${row.flightId}/${row.date}/${row.cabin}`} onClick={(event) => { detailTrigger.current = event.currentTarget.querySelector("button"); open(); }} aria-selected={selected === row}>
          <th scope="row"><button className="inline-action occupancy-detail-trigger" type="button" aria-label={`Ver pasajes de ${row.flightId}, ${dateLabel(row.date)}, ${row.cabin}`} onClick={(event) => { detailTrigger.current = event.currentTarget; open(); }}>{row.flightId}</button></th><td>{dateLabel(row.date)}</td><td>{row.cabin}</td><td>{row.sold}</td><td>{row.capacity}</td><td>{row.occupancy}%</td>
        </tr>;
      })}</tbody></table></div>
      {selected && <section className="occupancy-detail" aria-labelledby="occupancy-detail-heading"><div className="panel-title"><h3 id="occupancy-detail-heading" ref={detailHeading} tabIndex={-1}>Pasajes confirmados · {selected.flightId}</h3><button className="button small" type="button" onClick={closeDetail}>Volver al reporte</button></div><p>{dateLabel(selected.date)} · {selected.cabin} · {selected.sold} pasajes vendidos</p>
        {!selected.passengers.length ? <p role="status">No existen pasajes confirmados para este vuelo, fecha y clase.</p> : <div className="occupancy-table-scroll"><table className="occupancy-table"><caption>{selected.passengers.length} pasajes confirmados, coincidentes con el reporte.</caption><thead><tr><th scope="col">Reserva</th><th scope="col">Pasajero</th><th scope="col">DNI</th></tr></thead><tbody>{selected.passengers.map((person, index) => <tr key={`${person.reservationCode}/${person.document}/${index}`}><td>{person.reservationCode}</td><td>{person.passenger}</td><td>{person.document}</td></tr>)}</tbody></table></div>}
      </section>}
    </>}
    {!live && <p className="form-hint">Fixtures de demostración; no representan ventas persistidas en Supabase.</p>}
  </section>;
}
