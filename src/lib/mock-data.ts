export type Flight = {
  id: string; origin: string; destination: string; departure: string;
  arrival: string; date: string; economy: number; first: number;
  seatsEconomy: number; seatsFirst: number; status: "Activo" | "Retrasado" | "Cancelado";
  isDemo?: boolean; archivedAt?: string | null;
};

export const airports = [
  { code: "EZE", city: "Buenos Aires", name: "Ministro Pistarini" },
  { code: "AEP", city: "Buenos Aires", name: "Aeroparque" },
  { code: "COR", city: "Córdoba", name: "Ingeniero Taravella" },
  { code: "MDZ", city: "Mendoza", name: "El Plumerillo" },
  { code: "BRC", city: "Bariloche", name: "Teniente Luis Candelaria" },
  { code: "SCL", city: "Santiago", name: "Arturo Merino Benítez" },
  { code: "USH", city: "Ushuaia", name: "Malvinas Argentinas" },
];

const date = (offset: number) => {
  const current = new Date();
  current.setDate(current.getDate() + offset);
  return current.toISOString().slice(0, 10);
};

export const flights: Flight[] = [
  { id: "AR-1420", origin: "EZE", destination: "BRC", departure: "07:20", arrival: "09:45", date: date(7), economy: 128500, first: 284000, seatsEconomy: 84, seatsFirst: 12, status: "Activo" },
  { id: "AR-2231", origin: "AEP", destination: "MDZ", departure: "11:15", arrival: "13:05", date: date(7), economy: 98400, first: 209000, seatsEconomy: 65, seatsFirst: 8, status: "Activo" },
  { id: "AR-0885", origin: "EZE", destination: "SCL", departure: "15:40", arrival: "17:50", date: date(8), economy: 166900, first: 342000, seatsEconomy: 47, seatsFirst: 6, status: "Retrasado" },
  { id: "AR-3310", origin: "COR", destination: "EZE", departure: "20:10", arrival: "21:45", date: date(9), economy: 88900, first: 196000, seatsEconomy: 91, seatsFirst: 10, status: "Activo" },
  { id: "AR-0441", origin: "AEP", destination: "USH", departure: "06:30", arrival: "10:15", date: date(10), economy: 195000, first: 401000, seatsEconomy: 39, seatsFirst: 5, status: "Activo" },
];

export const reservation = {
  code: "SIGV-7K2P9", flightId: "AR-1420", passenger: "Lucía Fernández",
  document: "30123456", cabin: "Economy", seats: 2, status: "Confirmada",
};

export const mockCollections: Record<string, unknown> = {
  dashboard: { flights: flights.length, activeFlights: flights.filter((f) => f.status === "Activo").length, reservations: 24, checkIns: 13 },
  flights, airports,
  capacities: flights.map((f) => ({ flightId: f.id, economy: f.seatsEconomy, first: f.seatsFirst })),
  fares: flights.map((f) => ({ flightId: f.id, economy: f.economy, first: f.first })),
  users: [{ id: "USR-01", name: "Martín Pérez", role: "Pasajero", status: "Activo" }, { id: "USR-02", name: "Ana Gómez", role: "Mostrador", status: "Activo" }],
  profile: { name: "Lucía Fernández", email: "lucia@example.test", phone: "+54 11 5555 0142" },
  auth: { mode: "mock", roles: ["pasajero", "admin", "mostrador"] },
  reservations: [reservation],
  payments: [{ id: "PAY-DEMO-01", reservationCode: reservation.code, status: "Aprobado (simulado)", amount: 257000 }],
  disruptions: [{ flightId: "AR-0885", kind: "Retraso", affectedBookings: 3, status: "Pendiente de comunicación" }],
  manifest: [{ flightId: "AR-1420", passenger: reservation.passenger, reservationCode: reservation.code, checkedIn: false }],
  "check-in": [{ reservationCode: reservation.code, seat: "12A", baggageKg: 18.5, status: "Pendiente" }],
  "boarding-passes": [{ reservationCode: reservation.code, flightId: reservation.flightId, seat: "12A", gate: "B04", status: "Ejemplo" }],
  notifications: [{ id: "N-01", title: "Cambio de horario", flightId: "AR-0885", status: "Simulado" }],
  tickets: [{ reservationCode: reservation.code, flightId: reservation.flightId, status: "Vigente", offline: false }],
  reports: [{ flightId: "AR-1420", cabin: "Economy", occupancy: 64 }, { flightId: "AR-1420", cabin: "Primera", occupancy: 50 }],
};
