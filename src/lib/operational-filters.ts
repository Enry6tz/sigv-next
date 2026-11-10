export function auditCalendarDate(value: unknown) {
  if (typeof value !== "string") return undefined;
  const iso = /^(\d{4}-\d{2}-\d{2})(?=$|[T ])/.exec(value);
  if (iso) return iso[1];
  const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?=$|[\s,])/.exec(value);
  if (!local) return undefined;
  const [, day, month, year] = local;
  if (+month < 1 || +month > 12 || +day < 1 || +day > 31) return undefined;
  return [(year.length === 2 ? "20" : "") + year, month.padStart(2, "0"), day.padStart(2, "0")].join("-");
}

export function keepVisibleSelection(selection: string, options: readonly { value: string }[]) {
  return options.some(({ value }) => value === selection) ? selection : "";
}

export function readyBoardingPasses<T extends { checkedIn: boolean; boardingPass: string | null; seat: string | null }>(passes: readonly T[]) {
  return passes.filter((pass) => pass.checkedIn && pass.boardingPass && pass.seat);
}
