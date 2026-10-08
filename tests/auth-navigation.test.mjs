import test from "node:test";
import assert from "node:assert/strict";
import { safeNextPath } from "../src/lib/auth-navigation.ts";
import { canAccess } from "../src/lib/catalog.ts";

test("conserva la selección completa al iniciar sesión sin permitir redirecciones externas", () => {
  const selection = "/pasajero/compra?flight=AR-1420&cabin=Primera&passengers=2&returnFlight=AR-1421&returnCabin=Economy";
  assert.equal(safeNextPath(selection), selection);
  for (const value of ["https://evil.test", "//evil.test", "/\\evil.test", "/pasajero/\\evil.test", "/pasajero\n/compra"]) assert.equal(safeNextPath(value), undefined);
});

test("el acceso a pantallas respeta rol y sprint", () => {
  assert.equal(canAccess("admin", "vuelos", 1), true);
  assert.equal(canAccess("pasajero", "vuelos", 3), false, "un pasajero nunca ve el CRUD de administración");
  assert.equal(canAccess("admin", "reportes", 2), false);
  assert.equal(canAccess("admin", "reportes", 3), true);
  assert.equal(canAccess("mostrador", "check-in", 2), true);
  assert.equal(canAccess("mostrador", "check-in", 1), false);
  assert.equal(canAccess("superadmin", "inicio", 3), false);
  assert.equal(canAccess("pasajero", "buscar-vuelos", 1), true);
});
