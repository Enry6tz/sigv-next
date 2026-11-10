import test from "node:test";
import assert from "node:assert/strict";
import { auditCalendarDate, keepVisibleSelection, readyBoardingPasses } from "../src/lib/operational-filters.ts";

test("audit date filters use the calendar day displayed in Argentine dates", () => {
  assert.equal(auditCalendarDate("3/11/26, 23:54:00"), "2026-11-03");
  assert.equal(auditCalendarDate("3/11/2026 23:54:00"), "2026-11-03");
  assert.equal(auditCalendarDate("2026-11-03T12:30:00-03:00"), "2026-11-03");
  assert.equal(auditCalendarDate("unknown"), undefined);
});

test("filtering retains a selected flight only when the same instance remains visible", () => {
  const options = [{ value: "AR-1200-20261104" }, { value: "AR-1200-20261105" }];
  assert.equal(keepVisibleSelection("AR-1200-20261105", options), "AR-1200-20261105");
  assert.equal(keepVisibleSelection("AR-1200-20261105", options.slice(0, 1)), "");
});

test("the list of boarding passes still requires check-in, an assigned seat and a pass code", () => {
  const ready = { checkedIn: true, boardingPass: "BP-01", seat: "12A" };
  assert.deepEqual(readyBoardingPasses([
    { ...ready, checkedIn: false }, { ...ready, seat: null }, { ...ready, boardingPass: null }, ready,
  ]), [ready]);
});
