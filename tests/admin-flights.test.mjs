import test from "node:test";
import assert from "node:assert/strict";
import { adminFlightDto, filterAdminFlights, frequencyLabel } from "../src/lib/admin-flights.ts";

test("frecuencias en orden semanal, diario y días hábiles", () => {
  assert.equal(frequencyLabel([5, 1, 3]), "Lun, Mié, Vie");
  assert.equal(frequencyLabel([0, 1, 2, 3, 4, 5, 6]), "Diario");
  assert.equal(frequencyLabel([5, 4, 3, 2, 1]), "Lun a Vie");
  assert.equal(frequencyLabel([0]), "Dom");
  assert.equal(frequencyLabel([]), "Sin frecuencia");
});

test("combina código y filtros de ruta sin distinguir mayúsculas en la búsqueda", () => {
  const rows = [{ code: "AR-1420", origin: "EZE", destination: "BRC" },
    { code: "AR-2231", origin: "AEP", destination: "MDZ" }];
  assert.deepEqual(filterAdminFlights(rows, " ar-1 ", "EZE", "BRC"), [rows[0]]);
  assert.deepEqual(filterAdminFlights(rows, "", "EZE", "MDZ"), []);
  assert.equal(filterAdminFlights(rows, "", "", "").length, 2);
});

test("listado reúne aeronave, frecuencia y configuración sin perder fechas o precios", () => {
  const result = adminFlightDto({ id: "schedule-1", code: "AR-1420", origin: "EZE", destination: "BRC",
    aircraft_id: "plane-1", aircraft: { model: "Boeing 737-800" }, departure: "07:20:00", arrival: "09:45:00",
    sale_start: "2026-07-01", sale_end: "2026-12-31", status: "Activa",
    schedule_frequencies: [{ weekday: 1 }, { weekday: 3 }],
    schedule_configurations: [{ cabin: "Primera", capacity: 12, price: "284000.00" },
      { cabin: "Economy", capacity: 120, price: "128500.00" }] });
  assert.equal(result.aircraftModel, "Boeing 737-800");
  assert.deepEqual(result.weekdays, [1, 3]);
  assert.equal(result.saleEnd, "2026-12-31");
  assert.equal(result.departure, "07:20");
  assert.equal(result.economy, 128500);
  assert.equal(result.seatsFirst, 12);
});

test("vuelos migrados sin aeronave no inventan una asignación", () => {
  const row = adminFlightDto({ id: "legacy", code: "AR-2231", aircraft_id: null, aircraft: null });
  assert.equal(row.aircraftId, null);
  assert.equal(row.aircraftModel, null);
});
