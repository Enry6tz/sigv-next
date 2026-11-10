import test from "node:test";
import assert from "node:assert/strict";
import { matchesFilter, matchesDateRange, filterOptions } from "../src/lib/filter-options.ts";

test("searches option labels, codes and synonyms without case or accent differences", () => {
  const options = [{ value: "COR", label: "Córdoba", keywords: "Taravella" }, { value: "MDZ", label: "Mendoza" }];
  assert.deepEqual(filterOptions(options, " CORDOBA "), [options[0]]);
  assert.deepEqual(filterOptions(options, "taravella cor"), [options[0]]);
  assert.deepEqual(filterOptions(options, ""), options);
  assert.deepEqual(filterOptions(options, "Ushuaia"), []);
  assert.equal(matchesFilter("ar 9512", "AR-9512"), true);
});

test("date filters are inclusive, preserve unfiltered records and exclude missing dates when active", () => {
  assert.equal(matchesDateRange("2026-11-15T12:00:00Z", "2026-11-15", "2026-11-15"), true);
  assert.equal(matchesDateRange("2026-11-16", "", "2026-11-15"), false);
  assert.equal(matchesDateRange(undefined, "", ""), true);
  assert.equal(matchesDateRange(undefined, "2026-11-15", ""), false);
});
