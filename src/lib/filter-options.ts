export type FilterOption = { value: string; label: string; keywords?: string };

function normalized(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/\p{Mark}/gu, "")
    .toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, " ").trim();
}

export function matchesFilter(query: string, ...values: unknown[]) {
  const terms = normalized(query);
  if (!terms) return true;
  const haystack = values.map(normalized).join(" ");
  return terms.split(" ").every((term) => haystack.includes(term));
}

export function filterOptions(options: readonly FilterOption[], query: string) {
  return options.filter(({ label, value, keywords }) => matchesFilter(query, label, value, keywords));
}

export function uniqueOptions(values: readonly unknown[]) {
  return Array.from(new Set(values.filter((value) => value !== null && value !== undefined && value !== "").map(String)))
    .sort((a, b) => a.localeCompare(b, "es", { numeric: true })).map((value) => ({ value, label: value }));
}

export function matchesDateRange(value: unknown, from: string, to: string) {
  if (!from && !to) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return false;
  const day = value.slice(0, 10);
  return (!from || day >= from) && (!to || day <= to);
}
