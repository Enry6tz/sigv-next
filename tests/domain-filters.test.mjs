import test from "node:test";
import assert from "node:assert/strict";
import { emptyDomainFilters, filterDomainRows, seatFlightOptions } from "../src/lib/domain-filters.ts";

test("aircraft status distinguishes archived records from active aircraft", () => {
  const active = { id: "plane-1", status: "Activa", archivedAt: null };
  const archived = { id: "plane-2", status: "Activa", archivedAt: "2026-10-10T12:00:00Z" };
  assert.deepEqual(filterDomainRows([active, archived], { ...emptyDomainFilters, status: "Activa" }), [active]);
  assert.deepEqual(filterDomainRows([active, archived], { ...emptyDomainFilters, status: "Archivada" }), [archived]);
  assert.deepEqual(filterDomainRows([active, archived], emptyDomainFilters), [active, archived]);
});

test("schedule route and status combine with inclusive sales-period overlap", () => {
  const matching = { origin: "AEP", destination: "COR", status: "Activa", saleStart: "2026-11-01", saleEnd: "2026-11-10" };
  const later = { ...matching, saleStart: "2026-11-15", saleEnd: "2026-11-20" };
  const suspended = { ...matching, status: "Suspendida" };
  const otherRoute = { ...matching, origin: "EZE" };
  assert.deepEqual(filterDomainRows([matching, later, suspended, otherRoute], {
    ...emptyDomainFilters, origin: "AEP", destination: "COR", status: "Activa", from: "2026-11-10", to: "2026-11-12",
  }), [matching]);
  assert.deepEqual(filterDomainRows([matching], { ...emptyDomainFilters, from: "2026-11-12", to: "2026-11-10" }), []);
});

test("schedule details match a specific weekday or cabin without dropping Sunday", () => {
  const sunday = { scheduleId: "A", weekday: 0 };
  const monday = { scheduleId: "A", weekday: 1 };
  assert.deepEqual(filterDomainRows([sunday, monday, { ...sunday, scheduleId: "B" }], {
    ...emptyDomainFilters, scheduleId: "A", weekday: "0",
  }), [sunday]);
  const economy = { scheduleId: "A", cabin: "Economy" };
  const first = { scheduleId: "A", cabin: "Primera" };
  assert.deepEqual(filterDomainRows([economy, first], { ...emptyDomainFilters, scheduleId: "A", cabin: "Primera" }), [first]);
});

test("seat filtering combines flight, cabin and status and cannot display another flight's seats", () => {
  const seat = { flightId: "AR-9519", cabin: "Economy", status: "Disponible" };
  assert.deepEqual(filterDomainRows([seat, { ...seat, flightId: "AR-9526" }, { ...seat, cabin: "Primera" }, { ...seat, status: "Bloqueado" }], {
    ...emptyDomainFilters, flightId: "AR-9519", cabin: "Economy", status: "Disponible",
  }), [seat]);
});

test("seat flight options keep stable flight IDs and include the actual flight date and route", () => {
  const options = seatFlightOptions([
    { id: "flight-1", code: "AR-9519", date: "2026-11-19", origin: "BRC", destination: "AEP" },
    { id: "flight-2", code: "AR-9526", date: "2026-11-26", origin: "EZE", destination: "USH" },
  ], "2026-11-19");
  assert.deepEqual(options, [{ value: "flight-1", label: "AR-9519 · BRC → AEP · 19/11/2026", keywords: "2026-11-19" }]);
});
