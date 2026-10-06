export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// Only these known business messages may cross the database/API boundary.
const businessMessages = new Set([
  "Cancelá primero las reservas del vuelo", "El aeropuerto tiene vuelos activos",
  "La capacidad no puede ser menor que los asientos reservados", "La capacidad dejaría fuera asientos ya asignados",
  "La configuración excede la capacidad del avión", "La ruta incluye un aeropuerto archivado",
  "El avión no está activo", "Avión no disponible", "Programación no disponible",
  "Falta configurar Economy", "Falta configurar Primera", "El rango debe tener hasta 366 días",
  "Vuelo no encontrado", "Vuelo no disponible", "El vuelo no está disponible", "El vuelo fue cancelado",
  "Reserva no encontrada", "Reserva confirmada no encontrada", "La reserva ya está cancelada",
  "No se puede cancelar una reserva con check-in", "No tenés permiso sobre esta reserva",
  "La reserva ya fue procesada", "Método de prueba inválido", "Equipaje inválido", "Asiento o equipaje inválido",
  "Asiento no disponible en la cabina", "El asiento no pertenece a la cabina o supera su capacidad",
  "El asiento no pertenece a la cabina reservada", "Documento no encontrado en la reserva",
  "El pasajero ya tiene check-in", "Todos los pasajeros ya tienen check-in",
  "Cada pasajero debe tener un documento diferente", "No hay suficientes asientos Economy",
  "No hay suficientes asientos Primera", "Completá nombre, apellido y documento de cada pasajero",
  "La compra admite entre 1 y 9 pasajeros", "Pasajeros inválidos", "Cabina inválida",
  "Los cupos no pueden ser negativos", "La capacidad excede la numeración de asientos",
  "Seleccioná al menos un día de operación", "El período elegido no incluye los días de operación seleccionados",
  "Asigná al menos un asiento para publicar el vuelo", "Los horarios de salida y llegada deben ser diferentes",
]);

export function databaseError(error: { code?: string; message: string }): ApiError {
  if (error.code === "23503") {
    if (/aircraft|aircraft_id/i.test(error.message)) return new ApiError("La aeronave elegida ya no está disponible. Seleccioná otra.");
    if (/origin|destination|airport/i.test(error.message)) return new ApiError("Uno de los aeropuertos elegidos ya no está disponible. Revisá la ruta.");
    if (/flight_id/i.test(error.message)) return new ApiError("El vuelo elegido ya no está disponible. Actualizá la pantalla y elegí otro.");
    if (/reservation_id/i.test(error.message)) return new ApiError("La reserva elegida ya no está disponible. Actualizá la pantalla y revisá su estado.");
    return new ApiError("Uno de los datos seleccionados ya no está disponible. Actualizá la pantalla y volvé a elegirlo.");
  }
  if (error.code === "23505") return new ApiError(/flight_schedules_code|flights_pkey/i.test(error.message)
    ? "Ya existe un vuelo con ese código. Ingresá un código diferente."
    : "Ya existe un registro con esos datos. Revisá la información ingresada.", 409);
  if (error.code === "23514" || error.code?.startsWith("22") || error.code === "23502") return new ApiError("Revisá los campos: las fechas, tarifas y cantidades deben tener valores válidos.");
  if (error.code === "42501") return new ApiError("No tenés permiso para esta operación.", 403);
  if (error.code === "PGRST116") return new ApiError("El registro ya no está disponible. Actualizá la pantalla.", 404);
  if (error.code === "P0001" && businessMessages.has(error.message)) return new ApiError(error.message);
  if (error.code === "P0001" && /^(Se requiere rol|Iniciá sesión)/.test(error.message)) return new ApiError("Iniciá sesión con una cuenta autorizada para continuar.", 403);
  return new ApiError("No se pudo completar la operación. Intentá nuevamente en unos minutos.", 500);
}

export function publicError(error: unknown): { message: string; status: number } {
  return error instanceof ApiError ? { message: error.message, status: error.status }
    : { message: "No se pudo completar la operación. Intentá nuevamente en unos minutos.", status: 500 };
}
