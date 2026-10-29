export type FlightState = "Activo" | "Retrasado" | "Cancelado" | "Reprogramado" | "Operado";
export type OperationalFlight = {
  date: string; departure: string; arrival?: string; status: string;
  scheduledDeparture?: string; takenOffAt?: string | null; timeZone?: string;
};
export type FlightChange = { date?: string; departure?: string; arrival?: string; status?: string };
export const terminalFlightStates = ["Cancelado", "Reprogramado", "Operado"] as const;
const validClock = (value: string) => /^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/.test(value);

// Interpreta el horario de servicio en la zona del vuelo, no en la del navegador.
export function flightDepartureTime(flight: OperationalFlight): number {
  const target = Date.parse(`${flight.date}T${flight.departure.slice(0, 5)}:00Z`);
  if (!Number.isFinite(target)) return NaN;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: flight.timeZone ?? "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  let result = target;
  for (let attempt = 0; attempt < 2; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(result).map(({ type, value }) => [type, value]));
    const represented = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    result += target - represented;
  }
  return result;
}

export function flightStatus(flight: OperationalFlight, now = new Date()): FlightState {
  if (terminalFlightStates.includes(flight.status as typeof terminalFlightStates[number])) return flight.status as FlightState;
  return !flight.takenOffAt && now.getTime() > flightDepartureTime(flight) + 2 * 3600000 ? "Operado" : flight.status as FlightState;
}

export function nextFlightStatus(flight: OperationalFlight, change: FlightChange): FlightState {
  if (change.departure === undefined && change.status === undefined) return flight.status as FlightState;
  if (change.status && terminalFlightStates.includes(change.status as typeof terminalFlightStates[number])) return change.status as FlightState;
  const departure = change.departure ?? flight.departure;
  return departure.slice(0, 5) > (flight.scheduledDeparture ?? flight.departure).slice(0, 5) ? "Retrasado" : "Activo";
}

export function flightPolicyProblem(flight: OperationalFlight, change: FlightChange, now = new Date()): string | null {
  const status = flightStatus(flight, now);
  if (terminalFlightStates.includes(status as typeof terminalFlightStates[number])) return `El vuelo está en estado terminal: ${status}.`;
  if (change.status && !["Activo", "Retrasado", ...terminalFlightStates].includes(change.status)) return "Estado de vuelo inválido.";
  if ([change.departure, change.arrival].some((value) => value !== undefined && !validClock(value))) return "Ingresá un horario válido.";
  if (change.date !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(change.date) || !Number.isFinite(Date.parse(`${change.date}T00:00:00Z`)))) return "Ingresá una fecha de servicio válida.";
  if (change.date && change.date !== flight.date && flightDepartureTime(flight) - now.getTime() <= 48 * 3600000)
    return "No se puede cambiar la fecha de servicio dentro de las próximas 48 horas.";
  if (change.status === "Retrasado" && !change.departure) return "Ingresá la nueva hora de salida para registrar la demora.";
  if (change.departure && change.status === "Retrasado" && nextFlightStatus(flight, change) !== "Retrasado")
    return "La demora debe tener una hora posterior a la salida programada.";
  if ((change.departure ?? flight.departure).slice(0, 5) === (change.arrival ?? flight.arrival)?.slice(0, 5))
    return "Los horarios de salida y llegada deben ser diferentes";
  return null;
}
