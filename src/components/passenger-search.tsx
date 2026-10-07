"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { Flight } from "@/lib/mock-data";
import { displayFlightCode } from "@/lib/flight-code";
import { bookingHref, cabinAvailable, durationMinutes, parsePassengerCount, searchFlights, stopsLabel, validReturnFlight, type Cabin, type FlightSort, type PassengerQuery } from "@/lib/passenger-search";

type Airport = { code: string; city: string };
const money = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);

export function PassengerSearch({ initialQuery, sprint }: { initialQuery: PassengerQuery; sprint: number }) {
  const [airports, setAirports] = useState<Airport[]>([]);
  const [flights, setFlights] = useState<Flight[] | null>(null);
  const [error, setError] = useState("");
  const [airportError, setAirportError] = useState("");
  const [origin, setOrigin] = useState(initialQuery.origin || "EZE");
  const [destination, setDestination] = useState(initialQuery.destination || "SCL");
  const [travelDate, setTravelDate] = useState(initialQuery.date);
  const [trip, setTrip] = useState(initialQuery.trip || "round-trip");
  const [returnDate, setReturnDate] = useState(initialQuery.returnDate || "");
  const [leg, setLeg] = useState<"outbound" | "return">("outbound");
  const [outbound, setOutbound] = useState<{ flight: string; cabin: Cabin } | null>(null);
  const [count, setCount] = useState(parsePassengerCount(initialQuery.passengers));
  const [sort, setSort] = useState<FlightSort>("price");
  const [selection, setSelection] = useState<{ flight: string; cabin: Cabin } | null>(null);
  const [validation, setValidation] = useState("");
  const [editingSearch, setEditingSearch] = useState(false);
  const [expandedFlight, setExpandedFlight] = useState<string | null>(null);
  const [directOnly, setDirectOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [maxPrice, setMaxPrice] = useState("");
  const [preferredCabin, setPreferredCabin] = useState<Cabin>(initialQuery.cabin === "Primera" ? "Primera" : "Economy");
  const [today] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }));
  const hasSearch = Boolean(initialQuery.origin && initialQuery.destination && initialQuery.date);
  const roundTrip = initialQuery.trip === "round-trip" && Boolean(initialQuery.returnDate);
  const passengers = parsePassengerCount(initialQuery.passengers);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/data/airports", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudieron cargar los aeropuertos.");
      setAirports(result.data);
    }).catch((reason) => { if (!controller.signal.aborted) setAirportError(reason.message); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!hasSearch) return;
    const controller = new AbortController();
    const queries = [{ origin: initialQuery.origin, destination: initialQuery.destination, date: initialQuery.date }];
    if (roundTrip) queries.push({ origin: initialQuery.destination, destination: initialQuery.origin, date: initialQuery.returnDate! });
    Promise.all(queries.map(async (query) => {
      const response = await fetch(`/api/data/flights?${new URLSearchParams(query)}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudieron cargar los vuelos.");
      return result.data as Flight[];
    })).then((legs) => {
      setFlights(legs.flat());
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [hasSearch, roundTrip, initialQuery.origin, initialQuery.destination, initialQuery.date, initialQuery.returnDate]);

  const activeQuery = leg === "return" ? { origin: initialQuery.destination, destination: initialQuery.origin, date: initialQuery.returnDate! } : initialQuery;
  const outboundFlight = flights?.find((flight) => flight.id === outbound?.flight);
  const results = searchFlights(flights ?? [], { ...activeQuery, passengers }, sort).filter((flight) =>
    (leg !== "return" || !outboundFlight || validReturnFlight(outboundFlight, flight)) && (!directOnly || !flight.stops?.length) &&
    (!maxPrice || Math.min(cabinAvailable(flight, "Economy", passengers) ? flight.economy : Infinity, cabinAvailable(flight, "Primera", passengers) ? flight.first : Infinity) <= Number(maxPrice)));
  const city = (code: string) => airports.find((airport) => airport.code === code)?.city ?? code;
  function submit(event: FormEvent<HTMLFormElement>) {
    if (origin === destination) { event.preventDefault(); setValidation("El origen y el destino deben ser distintos."); }
    else if (trip === "round-trip" && (!returnDate || returnDate < travelDate)) { event.preventDefault(); setValidation("La fecha de vuelta debe ser igual o posterior a la ida."); }
  }
  const options = (value: string) => <>{!airports.some((airport) => airport.code === value) && <option value={value}>{value}</option>}{airports.map((airport) => <option key={airport.code} value={airport.code}>{airport.city} ({airport.code})</option>)}</>;

  return <div className={`passenger-search ${hasSearch ? "has-results" : "initial"}${editingSearch ? " editing" : ""}`}>
    {hasSearch && <div className="passenger-mobile-summary"><button type="button" onClick={() => setEditingSearch(true)}>← Modificar búsqueda</button><h1>{city(activeQuery.origin).replace("Buenos Aires", "Bs. Aires")} → {city(activeQuery.destination).replace("Buenos Aires", "Bs. Aires")}</h1><p>{new Date(`${activeQuery.date}T12:00:00`).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })} · {passengers} {passengers === 1 ? "pasajero" : "pasajeros"}{flights && ` · ${results.length} ${results.length === 1 ? "vuelo" : "vuelos"}`}</p></div>}
    <section className="passenger-hero"><div className="passenger-container">
      <div className="passenger-intro"><p className="kicker light">BUSCADOR DE VUELOS</p><h1>¿A dónde vas hoy?</h1><p className="passenger-subtitle"><span className="passenger-desktop-subtitle">Explorá destinos nacionales e internacionales</span><span className="passenger-mobile-subtitle">{airports.length ? `${airports.length} destinos disponibles` : "Destinos nacionales e internacionales"}</span></p></div>
      <form className="passenger-search-form" action="/pasajero/buscar-vuelos" onSubmit={submit}>
        <div className="passenger-search-fields">
          <label className="passenger-origin">Origen<span className="passenger-location-field"><span aria-hidden="true">📍</span><select name="origin" value={origin} onChange={(event) => { setOrigin(event.target.value); setValidation(""); }} required>{options(origin)}</select></span></label>
          <div className="passenger-swap"><button type="button" aria-label="Intercambiar origen y destino" onClick={() => { setOrigin(destination); setDestination(origin); setValidation(""); }}>↑↓</button></div>
          <label className="passenger-destination">Destino<span className="passenger-location-field"><span aria-hidden="true">✈️</span><select name="destination" value={destination} onChange={(event) => { setDestination(event.target.value); setValidation(""); }} required>{options(destination)}</select></span></label>
          <label>Fecha de ida<input name="date" type="date" value={travelDate} onChange={(event) => setTravelDate(event.target.value)} min={today} required /></label>
          <label>Fecha de vuelta<input name="returnDate" type="date" value={returnDate} onChange={(event) => setReturnDate(event.target.value)} min={travelDate || today} required={trip === "round-trip"} disabled={trip !== "round-trip"} /></label>
          <label className="passenger-count">Pasajeros<span className="passenger-location-field"><span aria-hidden="true">👤</span><select name="passengers" value={count} onChange={(event) => setCount(Number(event.target.value))}>{Array.from({ length: 9 }, (_, index) => <option key={index} value={index + 1}>{index + 1} {index ? "pasajeros" : "pasajero"}</option>)}</select></span></label>
          <label className="passenger-cabin-preference">Clase de cabina<select name="cabin" value={preferredCabin} onChange={(event) => setPreferredCabin(event.target.value as Cabin)}><option value="Economy">Economy</option><option value="Primera">Primera clase</option></select></label>
          <button className="button dark" type="submit" disabled={!airports.length}><span>Buscar<br /> vuelos</span></button>
        </div>
        <input type="hidden" name="trip" value={trip} />
        <div className="passenger-trip-tabs" aria-label="Tipo de viaje"><button type="button" aria-pressed={trip === "round-trip"} onClick={() => setTrip("round-trip")}>Ida y vuelta</button><button type="button" aria-pressed={trip === "one-way"} onClick={() => setTrip("one-way")}>Solo ida</button><button type="button" disabled title="Próximamente">Multi-destino</button></div>
      </form>
      {(validation || airportError) && <p className="passenger-search-error" role="alert">{validation || airportError}</p>}
    </div></section>
    <section className="passenger-container passenger-results" aria-label="Resultados de búsqueda">
      {!hasSearch ? <div className="passenger-empty"><span aria-hidden="true">✈️</span><p>Ingresá origen, destino y fecha para ver los vuelos disponibles</p></div> : <>
        <div className="passenger-mobile-filters"><div className="passenger-filter-pills"><button type="button" aria-pressed={!directOnly} onClick={() => { setDirectOnly(false); setMaxPrice(""); }}>Todos</button><button type="button" aria-pressed={directOnly} onClick={() => setDirectOnly(!directOnly)}>Directo</button><button type="button" aria-expanded={sortOpen} aria-controls="passenger-mobile-sort" onClick={() => { setSortOpen(!sortOpen); setFiltersOpen(false); }}>↕ Ordenar</button><button type="button" aria-expanded={filtersOpen} aria-controls="passenger-mobile-filter-fields" onClick={() => { setFiltersOpen(!filtersOpen); setSortOpen(false); }}>⊞ Filtrar</button></div>
          {sortOpen && <label id="passenger-mobile-sort" className="passenger-filter-field">Ordenar por<select value={sort} onChange={(event) => setSort(event.target.value as FlightSort)}><option value="price">Precio</option><option value="duration">Duración</option><option value="departure">Salida</option><option value="arrival">Llegada</option></select></label>}
          {filtersOpen && <div id="passenger-mobile-filter-fields" className="passenger-mobile-filter-fields"><label><input type="checkbox" checked={directOnly} onChange={(event) => setDirectOnly(event.target.checked)} /> Solo vuelos directos</label><label className="passenger-filter-field">Precio máximo por persona<input type="number" min="0" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="Sin límite" /></label><button type="button" className="button small" onClick={() => { setDirectOnly(false); setMaxPrice(""); }}>Limpiar filtros</button></div>}
        </div>
        {roundTrip && <div className="passenger-trip-progress"><strong>{leg === "outbound" ? "1. Elegí tu vuelo de ida" : "2. Elegí tu vuelo de vuelta"}</strong>{outboundFlight && leg === "return" && <><span>Ida: {displayFlightCode(outboundFlight)} · {outbound!.cabin}</span><button className="button small" type="button" onClick={() => { setLeg("outbound"); setSelection(outbound); }}>Cambiar ida</button></>}</div>}
        <div className="passenger-results-heading"><div><h2>{city(activeQuery.origin)} → {city(activeQuery.destination)}</h2><p>{new Date(`${activeQuery.date}T12:00:00`).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })} · {passengers} {passengers === 1 ? "pasajero" : "pasajeros"}{flights && <> · <strong>{results.length} {results.length === 1 ? "vuelo encontrado" : "vuelos encontrados"}</strong></>}</p></div>
          <div className="passenger-sort" aria-label="Ordenar vuelos"><span>Ordenar por:</span>{([["price", "Precio"], ["duration", "Duración"], ["departure", "Salida"], ["arrival", "Llegada"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={sort === value} onClick={() => setSort(value)}>{label}</button>)}</div>
        </div>
        {error ? <p role="alert" className="error-box">{error}</p> : !flights ? <p role="status" className="passenger-empty">Cargando vuelos…</p> : !results.length ? <div className="passenger-empty" role="status"><span aria-hidden="true">✈️</span><p>No hay vuelos disponibles para esa ruta, fecha y cantidad de pasajeros. Probá con otra búsqueda.</p></div> : <>
          <div className="passenger-flight-columns" aria-hidden="true"><span>Vuelo</span><span>Escalas</span><span>Duración</span><span>Economy</span><span>Primera clase</span><span /></div>
          <div className="passenger-flight-list">{results.map((flight, index) => {
            const selected = selection?.flight === flight.id;
            const duration = durationMinutes(flight);
            const mobileCabin = selected ? selection.cabin : cabinAvailable(flight, preferredCabin, passengers) ? preferredCabin : cabinAvailable(flight, "Economy", passengers) ? "Economy" : "Primera";
            const mobileSeats = mobileCabin === "Economy" ? flight.seatsEconomy : flight.seatsFirst;
            const proceed = selected && (roundTrip && leg === "outbound" ? <button className="button dark small" type="button" onClick={() => { setOutbound(selection); setSelection(null); setExpandedFlight(null); setLeg("return"); }}>Elegir vuelta →</button> : <Link className="button dark small" href={leg === "return" && outbound ? bookingHref(outbound.flight, outbound.cabin, passengers, selection) : bookingHref(flight.id, selection.cabin, passengers)}>Continuar →</Link>);
            return <article className={`passenger-flight-row${selected ? " selected" : ""}${expandedFlight === flight.id ? " classes-open" : ""}${index === 0 && !selection ? " featured" : ""}`} key={flight.id} aria-label={`Vuelo ${displayFlightCode(flight)}`}>
              <div className="passenger-mobile-flight"><div className="passenger-mobile-flight-code"><span>{displayFlightCode(flight)}</span>{mobileSeats <= 5 && <strong>¡Solo {mobileSeats} {mobileSeats === 1 ? "asiento" : "asientos"}!</strong>}</div><div className="passenger-mobile-flight-route"><div><strong>{flight.departure}</strong><small>{flight.origin}</small></div><div className="passenger-mobile-flight-path"><span>{Math.floor(duration / 60)}h {String(duration % 60).padStart(2, "0")}m</span><div aria-hidden="true">────────→</div><small>{stopsLabel(flight)}</small></div><div><strong>{flight.arrival}</strong><small>{flight.destination}</small></div></div>{flight.status === "Retrasado" && <small className="passenger-delay">Retrasado</small>}</div>
              <div className="passenger-flight-time"><strong>{flight.departure} <span>→</span> {flight.arrival}</strong><small>{displayFlightCode(flight)}</small>{flight.status === "Retrasado" && <small className="passenger-delay">Retrasado</small>}</div>
              <div className="passenger-flight-stops"><span className={flight.stops?.length ? undefined : "direct-flight"}>{stopsLabel(flight)}</span></div>
              <div className="passenger-flight-duration">{Math.floor(duration / 60)}h {String(duration % 60).padStart(2, "0")}m</div>
              {(["Economy", "Primera"] as const).map((cabin) => {
                const available = cabinAvailable(flight, cabin, passengers);
                return <button key={cabin} type="button" className="passenger-fare" aria-label={`Elegir ${cabin === "Primera" ? "Primera clase" : cabin} en vuelo ${displayFlightCode(flight)}`} aria-pressed={selected && selection.cabin === cabin} disabled={!available} onClick={() => setSelection({ flight: flight.id, cabin })}>
                  <span className="passenger-fare-name">{cabin === "Primera" ? "Primera clase" : "Economy"}</span><strong>{money(cabin === "Economy" ? flight.economy : flight.first)}</strong><small>{available ? "por persona" : "Sin cupos para tu grupo"}</small>
                  <span className="passenger-fare-benefits">{flight.baggageIncluded && <span>Equipaje incluido</span>}{flight.seatSelectionEnabled && <span>Selección de asiento</span>}{flight.onlineCheckInEnabled && <span>Check-in online</span>}</span>
                </button>;
              })}
              <div className="passenger-flight-action">{sprint < 2 ? <span className="muted">Compra próximamente</span> : selected ? proceed : <button className="button small" type="button" onClick={() => setSelection({ flight: flight.id, cabin: cabinAvailable(flight, "Economy", passengers) ? "Economy" : "Primera" })}>Seleccionar</button>}</div>
              <div className="passenger-mobile-flight-footer"><div><small>{selected ? "tarifa elegida" : "desde"}</small><strong>{money(mobileCabin === "Economy" ? flight.economy : flight.first)}</strong><small>por persona · {mobileCabin === "Economy" ? "economy" : "primera clase"}</small></div>{sprint < 2 ? <span>Compra próximamente</span> : selected ? proceed : <button className="button small" type="button" aria-expanded={expandedFlight === flight.id} onClick={() => setExpandedFlight(expandedFlight === flight.id ? null : flight.id)}>{expandedFlight === flight.id ? "Ocultar clases" : index === 0 ? "Elegir →" : "Ver clases"}</button>}</div>
            </article>;
          })}</div>
        </>}
      </>}
    </section>
  </div>;
}
