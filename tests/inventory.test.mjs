import test from "node:test";
import assert from "node:assert/strict";
import { summarizeInventory } from "../src/lib/inventory.ts";

test("US-034: venta y asignación física son contadores distintos", () => {
  const row = { capacityEconomy: 10, capacityFirst: 2, seatsEconomy: 7, seatsFirst: 1 };
  assert.deepEqual(summarizeInventory(row), { soldEconomy: 3, soldFirst: 1, soldTotal: 4, assignedEconomy: 0, assignedFirst: 0 });
  assert.deepEqual(summarizeInventory(row, 2, 1), { soldEconomy: 3, soldFirst: 1, soldTotal: 4, assignedEconomy: 2, assignedFirst: 1 });
});
test("US-034: devolución de cupo reduce vendidos y no inventa ocupación", () => {
  assert.equal(summarizeInventory({ capacityEconomy: 10, capacityFirst: 2, seatsEconomy: 8, seatsFirst: 2 }).soldTotal, 2);
});
