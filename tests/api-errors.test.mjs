import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, databaseError, publicError } from "../src/lib/api-errors.ts";

test("no muestra detalles de claves foráneas al usuario", () => {
  const error = databaseError({ code: "23503", message: 'insert or update violates foreign key constraint "flight_schedules_origin_fkey"' });
  assert.match(error.message, /aeropuertos/);
  assert.doesNotMatch(error.message, /foreign|constraint|fkey|flight_schedules/);
});
test("explica qué hacer ante código duplicado o aeronave eliminada", () => {
  const duplicate = databaseError({ code: "23505", message: 'duplicate key violates constraint "flight_schedules_code_key"' });
  assert.equal(duplicate.status, 409);
  assert.match(duplicate.message, /código diferente/);
  assert.match(databaseError({ code: "23503", message: "flight_schedules_aircraft_id_fkey" }).message, /aeronave/);
});
test("conserva solo errores de negocio conocidos", () => {
  assert.equal(databaseError({ code: "P0001", message: "Cancelá primero las reservas del vuelo" }).message, "Cancelá primero las reservas del vuelo");
  assert.doesNotMatch(databaseError({ code: "P0001", message: "secret SQL internal table" }).message, /secret|SQL|table/);
});
test("oculta fallos inesperados y configuración interna", () => {
  for (const error of [new Error("Secret connection URL password"), { message: "private key" }, null]) {
    assert.deepEqual(publicError(error), { status: 500, message: "No se pudo completar la operación. Intentá nuevamente en unos minutos." });
  }
  assert.equal(databaseError({ code: "PGRST202", message: "Could not find function sigv_publish_flight_schedule in schema cache" }).status, 500);
});
test("preserva los errores de validación controlados por la aplicación", () => {
  assert.deepEqual(publicError(new ApiError("Revisá las fechas", 400)), { message: "Revisá las fechas", status: 400 });
});
