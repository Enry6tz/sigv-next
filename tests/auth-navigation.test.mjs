import test from "node:test";
import assert from "node:assert/strict";
import { safeNextPath } from "../src/lib/auth-navigation.ts";

test("conserva la selección completa al iniciar sesión sin permitir redirecciones externas", () => {
  const selection = "/pasajero/compra?flight=AR-1420&cabin=Primera&passengers=2&returnFlight=AR-1421&returnCabin=Economy";
  assert.equal(safeNextPath(selection), selection);
  for (const value of ["https://evil.test", "//evil.test", "/\\evil.test", "/pasajero/\\evil.test", "/pasajero\n/compra"]) assert.equal(safeNextPath(value), undefined);
});
