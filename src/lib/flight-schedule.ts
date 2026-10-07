export type Aircraft = {
  id: string; model: string; registration: string;
  capacityEconomy: number; capacityFirst: number;
  status: string; archivedAt?: string | null;
};

export function durationMinutes(departure: string, arrival: string): number | null {
  if (![departure, arrival].every((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return null;
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  return (minutes(arrival) - minutes(departure) + 1440) % 1440;
}

export function countDepartures(start: string, end: string, weekdays: number[]): number {
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || to - from > 366 * 86400000) return 0;
  let count = 0;
  for (let day = from; day <= to; day += 86400000) {
    if (weekdays.includes(new Date(day).getUTCDay())) count++;
  }
  return count;
}

export function validateFlightSchedule(payload: Record<string, unknown>, aircraft?: Aircraft): string | null {
  const value = (key: string) => typeof payload[key] === "string" ? (payload[key] as string).trim() : "";
  if (!/^[A-Z0-9][A-Z0-9-]{1,19}$/i.test(value("flightCode"))) return "Ingresá un código de vuelo de 2 a 20 caracteres, con letras, números o guiones.";
  if (!["origin", "destination"].every((key) => /^[A-Z]{3}$/i.test(value(key)))) return "Seleccioná los aeropuertos de origen y destino.";
  if (value("origin").toUpperCase() === value("destination").toUpperCase()) return "El origen y el destino deben ser diferentes.";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value("aircraftId"))) return "Seleccioná una aeronave disponible.";
  const duration = durationMinutes(value("departure"), value("arrival"));
  if (duration === null || duration === 0) return "Ingresá horarios válidos y distintos de salida y llegada.";
  const days = payload.weekdays;
  if (!Array.isArray(days) || !days.length || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6) || new Set(days).size !== days.length)
    return "Seleccioná al menos un día de operación, sin repetir días.";
  const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
  if (!["saleStart", "saleEnd"].every((key) => validDate(value(key)))) return "Completá las fechas del período de venta.";
  const range = (Date.parse(value("saleEnd")) - Date.parse(value("saleStart"))) / 86400000;
  if (range < 0) return "La fecha de fin debe ser igual o posterior a la fecha de inicio.";
  if (range > 366) return "El período de venta puede abarcar hasta 366 días de diferencia entre fechas.";
  if (!countDepartures(value("saleStart"), value("saleEnd"), days)) return "El período elegido no incluye los días de operación seleccionados.";
  for (const [key, label, integer, max] of [
    ["seatsEconomy", "Los asientos Economy", true, 582], ["seatsFirst", "Los asientos de Primera Clase", true, 12],
    ["economy", "La tarifa Economy", false, 9999999999.99], ["first", "La tarifa de Primera Clase", false, 9999999999.99],
  ] as const) {
    const raw = payload[key];
    const number = Number(raw);
    if ((typeof raw !== "number" && typeof raw !== "string") || String(raw).trim() === "" || !Number.isFinite(number) || number < 0 || number > max || (integer && !Number.isInteger(number)))
      return `${label} deben tener un valor ${integer ? "entero " : ""}entre 0 y ${max}.`;
  }
  if (Number(payload.seatsEconomy) + Number(payload.seatsFirst) === 0) return "Asigná al menos un asiento para publicar el vuelo.";
  for (const key of ["baggageIncluded", "seatSelectionEnabled", "onlineCheckInEnabled"]) {
    if (typeof payload[key] !== "boolean") return "Revisá las opciones adicionales de la tarifa.";
  }
  if (aircraft) {
    if (aircraft.id !== value("aircraftId") || aircraft.status !== "Activa" || aircraft.archivedAt) return "La aeronave elegida ya no está disponible. Seleccioná otra.";
    if (Number(payload.seatsEconomy) > aircraft.capacityEconomy || Number(payload.seatsFirst) > aircraft.capacityFirst)
      return "Los asientos de cada clase no pueden superar la capacidad de la aeronave.";
  }
  return null;
}
