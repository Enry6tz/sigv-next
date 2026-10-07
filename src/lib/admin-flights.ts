export type AdminFlight = {
  id: string; code: string; origin: string; destination: string;
  aircraftId: string | null; aircraftModel: string | null;
  departure: string; arrival: string; saleStart: string; saleEnd: string;
  weekdays: number[]; status: "Activa" | "Suspendida";
  economy: number; first: number; seatsEconomy: number; seatsFirst: number;
  baggageIncluded: boolean; seatSelectionEnabled: boolean; onlineCheckInEnabled: boolean;
};

export const operationDays = [
  { day: 1, label: "Lun" }, { day: 2, label: "Mar" }, { day: 3, label: "Mié" },
  { day: 4, label: "Jue" }, { day: 5, label: "Vie" }, { day: 6, label: "Sáb" }, { day: 0, label: "Dom" },
];

export function frequencyLabel(days: number[]) {
  const unique = new Set(days);
  if (unique.size === 7) return "Diario";
  if (unique.size === 5 && [1, 2, 3, 4, 5].every((day) => unique.has(day))) return "Lun a Vie";
  return operationDays.filter(({ day }) => unique.has(day)).map(({ label }) => label).join(", ") || "Sin frecuencia";
}

export function filterAdminFlights(rows: AdminFlight[], code: string, origin: string, destination: string) {
  return rows.filter((row) => row.code.toLowerCase().includes(code.trim().toLowerCase())
    && (!origin || row.origin === origin) && (!destination || row.destination === destination));
}

type ScheduleRow = Record<string, unknown>;
export function adminFlightDto(row: ScheduleRow): AdminFlight {
  const plane = row.aircraft as ScheduleRow | null;
  const configurations = (row.schedule_configurations ?? []) as ScheduleRow[];
  const economy = configurations.find((item) => item.cabin === "Economy");
  const first = configurations.find((item) => item.cabin === "Primera");
  return {
    id: String(row.id), code: String(row.code), origin: String(row.origin), destination: String(row.destination),
    aircraftId: row.aircraft_id ? String(row.aircraft_id) : null, aircraftModel: plane ? String(plane.model) : null,
    departure: String(row.departure).slice(0, 5), arrival: String(row.arrival).slice(0, 5),
    saleStart: String(row.sale_start), saleEnd: String(row.sale_end), status: row.status as AdminFlight["status"],
    weekdays: ((row.schedule_frequencies ?? []) as ScheduleRow[]).map((item) => Number(item.weekday)),
    economy: Number(economy?.price ?? 0), first: Number(first?.price ?? 0),
    seatsEconomy: Number(economy?.capacity ?? 0), seatsFirst: Number(first?.capacity ?? 0),
    baggageIncluded: row.baggage_included === true, seatSelectionEnabled: row.seat_selection_enabled !== false,
    onlineCheckInEnabled: row.online_check_in_enabled !== false,
  };
}
