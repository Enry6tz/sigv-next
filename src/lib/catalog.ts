export type Role = "pasajero" | "admin" | "mostrador";

export const roleLabels: Record<Role, string> = {
  pasajero: "Pasajero",
  admin: "Administración",
  mostrador: "Mostrador",
};

export type Module = {
  slug: string;
  label: string;
  role: Role;
  sprint: 1 | 2 | 3;
  description: string;
  us: string;
  rf: string;
  resource: string;
};

// Asignación inicial propuesta. No hay reparto por sprint aprobado en las fuentes de SIGV.
export const modules: Module[] = [
  { slug: "inicio", label: "Inicio", role: "pasajero", sprint: 1, description: "Estado de viaje y accesos a las gestiones del pasajero.", us: "US-009, US-012", rf: "RF-009", resource: "dashboard" },
  { slug: "buscar-vuelos", label: "Buscar vuelos", role: "pasajero", sprint: 1, description: "Consulta por origen, destino y fecha con tarifas por clase.", us: "US-006, US-007", rf: "RF-002", resource: "flights" },
  { slug: "compra", label: "Comprar pasajes", role: "pasajero", sprint: 2, description: "Selección de clase, hasta nueve pasajes e identificación de pasajeros.", us: "US-015, US-016", rf: "RF-003", resource: "reservations" },
  { slug: "pago", label: "Pago de prueba", role: "pasajero", sprint: 2, description: "Pago simulado y emisión de comprobantes de demostración.", us: "—", rf: "RF-004", resource: "payments" },
  { slug: "facturas", label: "Comprobantes", role: "pasajero", sprint: 2, description: "Comprobantes asociados a pagos de prueba.", us: "—", rf: "RF-004", resource: "invoices" },
  { slug: "mis-reservas", label: "Mis reservas", role: "pasajero", sprint: 2, description: "Reservas, pasajes y estados de vuelo.", us: "US-011", rf: "RF-003, RF-011", resource: "reservations" },
  { slug: "perfil", label: "Mi perfil", role: "pasajero", sprint: 1, description: "Datos personales y de contacto del pasajero.", us: "US-011", rf: "RF-009", resource: "profile" },
  { slug: "notificaciones", label: "Notificaciones", role: "pasajero", sprint: 3, description: "Avisos por cambios de horario y cancelaciones.", us: "—", rf: "RF-005", resource: "notifications" },
  { slug: "tickets", label: "Tickets digitales", role: "pasajero", sprint: 3, description: "Consulta de tickets en una vista adaptable a móvil.", us: "—", rf: "RF-007, RF-008", resource: "tickets" },
  { slug: "inicio", label: "Panel operativo", role: "admin", sprint: 1, description: "Resumen de vuelos, capacidad y accesos de administración.", us: "US-001–005", rf: "RF-001", resource: "dashboard" },
  { slug: "vuelos", label: "Vuelos", role: "admin", sprint: 1, description: "Programaciones, estados, filtros y edición de vuelos.", us: "US-001, US-003–005", rf: "RF-001, RF-011", resource: "flights" },
  { slug: "aeropuertos", label: "Aeropuertos", role: "admin", sprint: 1, description: "Catálogo de orígenes y destinos habilitados.", us: "US-001", rf: "RF-001", resource: "airports" },
  { slug: "aviones", label: "Aviones", role: "admin", sprint: 1, description: "Flota y capacidad física por cabina.", us: "US-001", rf: "RF-001", resource: "aircraft" },
  { slug: "programaciones", label: "Programaciones", role: "admin", sprint: 1, description: "Rutas y temporadas recurrentes.", us: "US-001, US-002", rf: "RF-001", resource: "schedules" },
  { slug: "frecuencias", label: "Frecuencias", role: "admin", sprint: 1, description: "Días de operación de cada programación.", us: "US-002", rf: "RF-001", resource: "frequencies" },
  { slug: "configuraciones", label: "Configuración por clase", role: "admin", sprint: 1, description: "Capacidad y tarifa base por programación.", us: "US-002", rf: "RF-001", resource: "configurations" },
  { slug: "capacidades", label: "Capacidades", role: "admin", sprint: 1, description: "Inventario Economy y Primera por vuelo.", us: "US-002", rf: "RF-001", resource: "capacities" },
  { slug: "tarifas", label: "Tarifas", role: "admin", sprint: 1, description: "Precios por clase y vigencia comercial.", us: "US-002", rf: "RF-001", resource: "fares" },
  { slug: "contingencias", label: "Contingencias", role: "admin", sprint: 2, description: "Reprogramación, cancelación y pasajeros afectados.", us: "US-004, US-005", rf: "RF-011", resource: "disruptions" },
  { slug: "asientos", label: "Asientos", role: "admin", sprint: 2, description: "Disponibilidad, ocupación y bloqueo de asientos.", us: "US-002", rf: "RF-010", resource: "seats" },
  { slug: "usuarios", label: "Usuarios", role: "admin", sprint: 1, description: "Cuentas y roles de pasajeros, mostrador y administración.", us: "US-008–014", rf: "RF-009", resource: "users" },
  { slug: "reportes", label: "Reportes", role: "admin", sprint: 3, description: "Ocupación por vuelo, clase y fechas.", us: "—", rf: "RF-006", resource: "reports" },
  { slug: "auditoria", label: "Auditoría", role: "admin", sprint: 3, description: "Historial de modificaciones de vuelos.", us: "—", rf: "RNF-008", resource: "flight-logs" },
  { slug: "inicio", label: "Panel de mostrador", role: "mostrador", sprint: 2, description: "Vuelos del día y flujo de atención presencial.", us: "US-012", rf: "RF-010", resource: "dashboard" },
  { slug: "manifiesto", label: "Manifiesto", role: "mostrador", sprint: 2, description: "Pasajeros confirmados de cada vuelo.", us: "—", rf: "RF-010", resource: "manifest" },
  { slug: "check-in", label: "Check-in", role: "mostrador", sprint: 2, description: "Identificación, asiento y equipaje despachado.", us: "—", rf: "RF-010", resource: "check-in" },
  { slug: "boarding-pass", label: "Boarding pass", role: "mostrador", sprint: 2, description: "Pase de embarque digital de prueba.", us: "—", rf: "RF-010", resource: "boarding-passes" },
  { slug: "asientos", label: "Asientos", role: "mostrador", sprint: 2, description: "Estado físico de asientos por vuelo.", us: "—", rf: "RF-010", resource: "seats" },
];

export const resourceSprint: Record<string, 1 | 2 | 3> = {
  dashboard: 1, flights: 1, airports: 1, capacities: 1, fares: 1,
  aircraft: 1, schedules: 1, frequencies: 1, configurations: 1,
  users: 1, profile: 1, auth: 1, reservations: 2, payments: 2,
  invoices: 2, seats: 2,
  disruptions: 2, manifest: 2, "check-in": 2, "boarding-passes": 2,
  notifications: 3, tickets: 3, reports: 3, "flight-logs": 3,
};

export function roleModules(role: Role, sprint: number) {
  return modules.filter((module) => module.role === role && module.sprint <= sprint);
}

export function findModule(role: string, slug: string) {
  return modules.find((module) => module.role === role && module.slug === slug);
}

export function isRole(value: string): value is Role {
  return value === "pasajero" || value === "admin" || value === "mostrador";
}
