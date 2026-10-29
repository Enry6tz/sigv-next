import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./server";
import { ApiError, databaseError } from "@/lib/api-errors";
import { validateFlightSchedule } from "@/lib/flight-schedule";
import { displayFlightCode } from "@/lib/flight-code";
import { adminFlightDto } from "@/lib/admin-flights";
import { documentProblem, emailProblem, normalizeDocument, normalizeEmail, normalizePhone, phoneProblem } from "@/lib/identity-validation";
import { mailConfigured, sendMail } from "@/lib/mail";
import { changeReason, flightChangeMail, type FlightChangeMailEvent } from "@/lib/flight-change-mail";
import { processMailOutbox, supabaseOutboxStore } from "@/lib/mail-outbox";
import { appTimeZone } from "@/lib/sprint";
import { boardingPassCode } from "@/lib/boarding-pass";
import { loadReceipts, scheduleReceiptEmail, sendReceiptEmail } from "@/lib/receipts";
import { flightStatus } from "@/lib/flight-policy";
import { buildOccupancyReport, type ReportFlight } from "@/lib/occupancy-report";
export { ApiError } from "@/lib/api-errors";

type Client = SupabaseClient;
type Json = Record<string, unknown>;

export async function processFlightMail(client: Client) {
  if (!mailConfigured()) return { claimed: 0, sent: 0, retry: 0, configured: false };
  const result = await processMailOutbox(supabaseOutboxStore(client), (item) => sendMail(flightChangeMail(item.payload as FlightChangeMailEvent, {
    email: process.env.FLIGHT_SUPPORT_EMAIL, phone: process.env.FLIGHT_SUPPORT_PHONE,
  })));
  return { ...result, configured: true };
}

function scheduleFlightMail(client: Client) {
  after(async () => {
    try { await processFlightMail(client); }
    catch { console.error("No se pudo procesar la cola de contingencias; los pendientes se conservan para el próximo intento."); }
  });
}

function reasonValue(value: unknown) {
  try { return changeReason(value); }
  catch (error) { throw new ApiError(error instanceof Error ? error.message : "Motivo inválido"); }
}

async function session(client: Client) {
  const { data } = await client.auth.getClaims();
  return data?.claims?.sub ?? null;
}

async function requireUser(client: Client) {
  const userId = await session(client);
  if (!userId) throw new ApiError("Iniciá sesión para continuar", 401);
  return userId;
}

async function requireRole(client: Client, roles: string[]) {
  await requireUser(client);
  const { data, error } = await client.rpc("sigv_role");
  if (error || !roles.includes(data)) throw new ApiError("No tenés permiso para esta operación", 403);
  return data as string;
}

function unwrap<T>(result: { data: T | null; error: { code?: string; message: string } | null }): T {
  if (result.error) {
    console.error("Data operation failed", result.error);
    throw databaseError(result.error);
  }
  return result.data as T;
}

const auditFields: Record<string, string> = {
  status: "Estado", flight_date: "Fecha", departure: "Salida", arrival: "Llegada", origin: "Origen", destination: "Destino",
  gate: "Puerta", economy: "Tarifa Economy", first: "Tarifa Primera", capacity_economy: "Capacidad Economy",
  capacity_first: "Capacidad Primera", archived_at: "Archivado", reservas_afectadas: "Reservas afectadas",
};

function flightDto(row: Json) {
  const operational = { date: String(row.flight_date), departure: String(row.departure), status: String(row.status),
    scheduledDeparture: String(row.scheduled_departure ?? row.departure), takenOffAt: row.taken_off_at as string | null,
    timeZone: String(row.service_timezone ?? appTimeZone) };
  return {
    id: row.id, origin: row.origin, destination: row.destination,
    code: displayFlightCode({ id: String(row.id), scheduleId: typeof row.schedule_id === "string" ? row.schedule_id : null }),
    date: row.flight_date, departure: String(row.departure).slice(0, 5),
    arrival: String(row.arrival).slice(0, 5), status: flightStatus(operational),
    scheduledDeparture: operational.scheduledDeparture.slice(0, 5), takenOffAt: operational.takenOffAt,
    timeZone: operational.timeZone,
    economy: Number(row.economy), first: Number(row.first),
    seatsEconomy: row.seats_economy, seatsFirst: row.seats_first,
    isDemo: row.is_demo, archivedAt: row.archived_at,
    baggageIncluded: row.baggage_included, seatSelectionEnabled: row.seat_selection_enabled,
    onlineCheckInEnabled: row.online_check_in_enabled,
    stops: Array.isArray(row.stops) ? row.stops : [],
    ...(typeof row.duration_minutes === "number" ? { durationMinutes: row.duration_minutes } : {}),
  };
}

async function flights(client: Client, filters?: URLSearchParams) {
  let query = client.from("flights").select("*").order("flight_date").order("departure");
  if (filters?.get("includeArchived") === "1") await requireRole(client, ["admin"]);
  else query = query.is("archived_at", null);
  const origin = filters?.get("origin")?.trim().toUpperCase();
  const destination = filters?.get("destination")?.trim().toUpperCase();
  const date = filters?.get("date");
  if (origin) query = query.eq("origin", origin);
  if (destination) query = query.eq("destination", destination);
  if (date) query = query.eq("flight_date", date);
  return unwrap(await query).map((row: Json) => flightDto(row));
}

async function reservations(client: Client) {
  await requireUser(client);
  const rows = unwrap(await client.from("reservations")
    .select("id,code,flight_id,cabin,passenger_count,total_amount,status,created_at,round_trip_id,reservation_passengers(id,first_name,last_name,document,seat,baggage_kg,checked_in_at)")
    .order("created_at", { ascending: false }));
  return rows.map((row: Json) => {
    const people = row.reservation_passengers as Json[];
    return {
      code: row.code, flightId: row.flight_id, cabin: row.cabin,
      returnReservationCode: row.round_trip_id ? rows.find((other: Json) => other.round_trip_id === row.round_trip_id && other.code !== row.code)?.code : undefined,
      seats: row.passenger_count, status: row.status, amount: Number(row.total_amount),
      passenger: people[0] ? `${people[0].first_name} ${people[0].last_name}` : "",
      document: people[0]?.document ?? "", passengers: people,
    };
  });
}

export async function readResource(resource: string, filters: URLSearchParams) {
  const client = await createClient();
  if (resource === "flight-mail") {
    await requireRole(client, ["admin"]);
    const items = unwrap(await client.from("flight_mail_outbox")
      .select("id,reservation_code,flight_id,recipient,status,attempts,next_attempt_at,last_error,created_at,sent_at")
      .order("created_at", { ascending: false }).limit(100));
    const attempts = unwrap(await client.from("flight_mail_attempts")
      .select("id,outbox_id,attempt,result,detail,created_at").order("created_at", { ascending: false }).limit(200));
    return { configured: mailConfigured(), items, attempts };
  }
  if (resource === "flights") return flights(client, filters);
  if (resource === "admin-flights") {
    await requireRole(client, ["admin"]);
    const rows = unwrap(await client.from("flight_schedules")
      .select("*,aircraft(model),schedule_frequencies(weekday),schedule_configurations(cabin,capacity,price)")
      .is("archived_at", null).order("code"));
    return rows.map((row: Json) => adminFlightDto(row));
  }
  if (resource === "airports") {
    let query = client.from("airports").select("*").order("code");
    if (filters.get("includeArchived") === "1") await requireRole(client, ["admin"]);
    else query = query.is("archived_at", null);
    return unwrap(await query);
  }
  if (resource === "aircraft") {
    await requireRole(client, ["admin"]);
    const rows = unwrap(await client.from("aircraft").select("*").order("registration"));
    return rows.map((row: Json) => ({ id: row.id, model: row.model, registration: row.registration,
      capacityEconomy: row.capacity_economy, capacityFirst: row.capacity_first,
      status: row.status, archivedAt: row.archived_at }));
  }
  if (resource === "schedules") {
    await requireRole(client, ["admin"]);
    const rows = unwrap(await client.from("flight_schedules").select("*").order("code"));
    return rows.map((row: Json) => ({ id: row.id, code: row.code, origin: row.origin, destination: row.destination,
      aircraftId: row.aircraft_id, departure: String(row.departure).slice(0,5), arrival: String(row.arrival).slice(0,5),
      saleStart: row.sale_start, saleEnd: row.sale_end, status: row.status, archivedAt: row.archived_at }));
  }
  if (resource === "frequencies") {
    await requireRole(client, ["admin"]);
    const rows = unwrap(await client.from("schedule_frequencies").select("schedule_id,weekday").order("schedule_id").order("weekday"));
    return rows.map((row: Json) => ({ scheduleId: row.schedule_id, weekday: row.weekday }));
  }
  if (resource === "configurations") {
    await requireRole(client, ["admin"]);
    const rows = unwrap(await client.from("schedule_configurations").select("schedule_id,cabin,capacity,price").order("schedule_id"));
    return rows.map((row: Json) => ({ scheduleId: row.schedule_id, cabin: row.cabin, capacity: row.capacity, price: Number(row.price) }));
  }
  if (resource === "capacities") {
    await requireRole(client, ["admin"]);
    return unwrap(await client.from("flights").select("id,seats_economy,seats_first,capacity_economy,capacity_first"))
      .map((row: Json) => ({ flightId: row.id, economy: row.seats_economy, first: row.seats_first, capacityEconomy: row.capacity_economy, capacityFirst: row.capacity_first }));
  }
  if (resource === "inventory") {
    await requireRole(client, ["admin", "mostrador"]);
    return unwrap(await client.rpc("sigv_flight_inventory", { p_flight_id: filters.get("flightId") || null }));
  }
  if (resource === "fares") {
    await requireRole(client, ["admin"]);
    return unwrap(await client.from("flights").select("id,economy,first"))
      .map((row: Json) => ({ flightId: row.id, economy: Number(row.economy), first: Number(row.first) }));
  }
  if (resource === "dashboard") {
    const allFlights = await flights(client);
    const userId = await session(client);
    const count = userId ? unwrap(await client.from("reservations").select("id"))?.length ?? 0 : 0;
    return { flights: allFlights.length, activeFlights: allFlights.filter((row) => row.status === "Activo").length, reservations: count };
  }
  if (resource === "profile") {
    const userId = await requireUser(client);
    const row = unwrap(await client.from("profiles").select("name,email,phone,document").eq("user_id", userId).single()) as { name: string; email: string; phone: string; document: string } | null;
    if (!row) throw new ApiError("Perfil no encontrado", 404);
    // Supabase Auth es la fuente de verdad del correo: refleja cambios confirmados
    // y expone un cambio pendiente (new_email) hasta que se abra el enlace.
    const { data: authData } = await client.auth.getUser();
    return { name: row.name, email: authData.user?.email ?? row.email, phone: row.phone, document: row.document, pendingEmail: authData.user?.new_email ?? null };
  }
  if (resource === "auth") {
    const userId = await session(client);
    if (!userId) return { signedIn: false };
    const role = unwrap(await client.rpc("sigv_role"));
    return { signedIn: true, role };
  }
  if (resource === "users") {
    await requireRole(client, ["admin"]);
    const people = unwrap(await client.from("profiles").select("user_id,name,email,phone").order("created_at"));
    const roles = unwrap(await client.from("user_roles").select("user_id,role"));
    const byId = new Map(roles.map((row: Json) => [row.user_id, row.role]));
    return people.map((row: Json) => ({ id: row.user_id, name: row.name, email: row.email, phone: row.phone, role: byId.get(row.user_id) ?? "pasajero" }));
  }
  if (resource === "reservations") return reservations(client);
  if (resource === "payments") {
    await requireUser(client);
    const rows = unwrap(await client.from("payments").select("id,method,amount,status,invoice,reservations(code)").order("created_at", { ascending: false }));
    return rows.map((row: Json) => ({ id: row.id, reservationCode: (row.reservations as Json)?.code, method: row.method, status: row.status, amount: Number(row.amount), invoice: row.invoice }));
  }
  if (resource === "invoices") {
    await requireUser(client);
    const rows = unwrap(await client.from("invoices").select("id,number,amount,issued_at,payments(reservations(code))").order("issued_at", { ascending: false }));
    return rows.map((row: Json) => ({ id: row.id, number: row.number, amount: Number(row.amount),
      issuedAt: row.issued_at, reservationCode: ((row.payments as Json)?.reservations as Json)?.code }));
  }
  if (resource === "seats") {
    await requireRole(client, ["admin", "mostrador"]);
    let query = client.from("flight_seats").select("id,flight_id,cabin,code,status").order("flight_id").order("code");
    if (filters.get("flightId")) query = query.eq("flight_id", text(filters.get("flightId")));
    const rows = unwrap(await query);
    return rows.map((row: Json) => ({ id: row.id, flightId: row.flight_id, cabin: row.cabin, code: row.code, status: row.status }));
  }
  if (resource === "flight-logs") {
    await requireRole(client, ["admin"]);
    const rows = unwrap(await client.from("flight_change_logs").select("id,flight_id,actor_id,field,old_value,new_value,changed_at").order("changed_at", { ascending: false }).limit(200));
    const actorIds = [...new Set(rows.map((row: Json) => row.actor_id).filter(Boolean))];
    const actors = actorIds.length ? unwrap(await client.from("profiles").select("user_id,name,email").in("user_id", actorIds)) : [];
    const actorName = new Map(actors.map((row: Json) => [row.user_id, row.name ? `${row.name} (${row.email})` : row.email]));
    const when = new Intl.DateTimeFormat("es-AR", { timeZone: appTimeZone, dateStyle: "short", timeStyle: "medium" });
    return rows.map((row: Json) => ({ changedAt: when.format(new Date(String(row.changed_at))), flightId: row.flight_id,
      actor: row.actor_id ? actorName.get(row.actor_id) ?? row.actor_id : "Sistema",
      field: auditFields[String(row.field)] ?? row.field, oldValue: row.old_value, newValue: row.new_value }));
  }
  if (resource === "notifications") {
    await requireUser(client);
    const rows = unwrap(await client.from("notifications").select("id,title,flight_id,read_at,created_at").order("created_at", { ascending: false }));
    return rows.map((row: Json) => ({ id: row.id, title: row.title, flightId: row.flight_id, status: row.read_at ? "Leída" : "Nueva" }));
  }
  if (["manifest", "check-in", "boarding-passes"].includes(resource)) {
    await requireRole(client, ["admin", "mostrador"]);
    const rows = unwrap(await client.from("reservations").select("code,flight_id,status,reservation_passengers(id,first_name,last_name,document,seat,baggage_kg,checked_in_at)").eq("status", "Confirmada"));
    return rows.flatMap((row: Json) => (row.reservation_passengers as Json[]).map((person) => ({
      id: person.id, reservationCode: row.code, flightId: row.flight_id,
      passenger: `${person.first_name} ${person.last_name}`,
      document: person.document, seat: person.seat, baggageKg: person.baggage_kg,
      checkedIn: Boolean(person.checked_in_at),
      status: person.checked_in_at ? "Completado" : "Pendiente",
      boardingPass: person.checked_in_at ? boardingPassCode(String(person.id)) : null,
    }))).filter((row) => resource !== "boarding-passes" || row.checkedIn);
  }
  if (resource === "tickets") {
    const rows = await reservations(client);
    return rows.filter((row) => row.status === "Confirmada")
      .flatMap((row) => row.passengers.map((person) => ({ id: person.id, reservationCode: row.code, flightId: row.flightId, passenger: `${person.first_name} ${person.last_name}`, seat: person.seat ?? "Pendiente", status: "Vigente", offline: false })));
  }
  if (resource === "disruptions") {
    await requireRole(client, ["admin"]);
    unwrap(await client.rpc("sigv_close_due_flights"));
    const allFlights = await flights(client);
    const allReservations = await reservations(client);
    return allFlights.map((row) => ({
      flightId: row.id, code: row.code, origin: row.origin, destination: row.destination,
      date: row.date, departure: row.departure, arrival: row.arrival, scheduledDeparture: row.scheduledDeparture,
      kind: row.status === "Cancelado" ? "Cancelación" : row.status === "Retrasado" ? "Retraso" : "Sin contingencia",
      affectedBookings: allReservations.filter((booking) => booking.flightId === row.id && booking.status !== "Cancelada").length,
      status: row.status,
    }));
  }
  if (resource === "reports") {
    await requireRole(client, ["admin"]);
    const reportFlights: ReportFlight[] = [];
    const reportReservations = [];
    // Paginar evita totales silenciosamente truncados por el límite de la Data API.
    for (let offset = 0; ; offset += 1000) {
      const rows = unwrap(await client.from("flights").select("id,flight_date,capacity_economy,capacity_first").order("id").range(offset, offset + 999));
      reportFlights.push(...rows.map((row: Json) => ({ id: String(row.id), date: String(row.flight_date), capacityEconomy: Number(row.capacity_economy), capacityFirst: Number(row.capacity_first) })));
      if (rows.length < 1000) break;
    }
    for (let offset = 0; ; offset += 1000) {
      const rows = unwrap(await client.from("reservations").select("code,flight_id,cabin,status,reservation_passengers(first_name,last_name,document)").eq("status", "Confirmada").order("id").range(offset, offset + 999));
      reportReservations.push(...rows.map((row) => ({ code: String(row.code), flightId: String(row.flight_id), cabin: String(row.cabin), status: String(row.status), passengers: row.reservation_passengers })));
      if (rows.length < 1000) break;
    }
    try { return buildOccupancyReport(reportFlights, reportReservations, filters); }
    catch (error) { throw new ApiError(error instanceof Error ? error.message : "Filtros inválidos"); }
  }
  throw new ApiError("Recurso desconocido", 404);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new ApiError(`${label} debe ser un número no negativo`);
  return number;
}

export async function writeResource(resource: string, method: "POST" | "PATCH" | "DELETE", payload: Json) {
  const client = await createClient();
  if (resource === "flight-mail" && method === "POST") {
    await requireRole(client, ["admin"]);
    return processFlightMail(client);
  }
  if (resource === "admin-flights" && ["PATCH", "DELETE"].includes(method)) {
    await requireRole(client, ["admin"]);
    if (!text(payload.id)) throw new ApiError("Falta la programación del vuelo");
    if (method === "PATCH" && payload.action === "fares") {
      positiveNumber(payload.economy, "Tarifa Economy");
      positiveNumber(payload.first, "Tarifa Primera");
    } else if (method === "PATCH" && payload.restore !== true) {
      const error = validateFlightSchedule(payload);
      if (error) throw new ApiError(error);
      if (!["Activa", "Suspendida"].includes(text(payload.status))) throw new ApiError("Seleccioná un estado válido");
    }
    return unwrap(await client.rpc("sigv_manage_flight_schedule", {
      p_schedule_id: text(payload.id), p_action: method === "DELETE" ? "delete" : payload.restore === true ? "restore" : payload.action === "fares" ? "fares" : "update",
      p_payload: payload,
    }));
  }
  if (resource === "flights" && method === "POST" && payload.action === "publish") {
    await requireRole(client, ["admin"]);
    const error = validateFlightSchedule(payload);
    if (error) throw new ApiError(error);
    return unwrap(await client.rpc("sigv_publish_flight_schedule", { p_payload: payload }));
  }
  if (resource === "aircraft" && method === "POST") {
    await requireRole(client, ["admin"]);
    const values = { model: text(payload.model), registration: text(payload.registration).toUpperCase(),
      capacity_economy: positiveNumber(payload.capacityEconomy, "Capacidad Economy"),
      capacity_first: positiveNumber(payload.capacityFirst, "Capacidad Primera") };
    if (!values.model || !values.registration || !Number.isInteger(values.capacity_economy) || !Number.isInteger(values.capacity_first))
      throw new ApiError("Completá modelo, matrícula y capacidades enteras");
    return unwrap(await client.from("aircraft").insert(values).select("*").single());
  }
  if (resource === "aircraft" && ["PATCH", "DELETE"].includes(method)) {
    await requireRole(client, ["admin"]);
    const updates: Json = method === "DELETE" ? { archived_at: new Date().toISOString() } : {};
    if (method === "PATCH") {
      for (const [from, to] of Object.entries({ model: "model", registration: "registration", status: "status", capacityEconomy: "capacity_economy", capacityFirst: "capacity_first" })) {
        if (payload[from] !== undefined) updates[to] = payload[from];
      }
      if (payload.restore === true) updates.archived_at = null;
    }
    if (!Object.keys(updates).length) throw new ApiError("No hay cambios válidos");
    return unwrap(await client.from("aircraft").update(updates).eq("id", text(payload.id)).select("*").single());
  }
  if (resource === "schedules" && method === "POST" && payload.action === "generate") {
    await requireRole(client, ["admin"]);
    return unwrap(await client.rpc("sigv_generate_schedule", { p_schedule_id: text(payload.scheduleId),
      p_from: text(payload.from), p_to: text(payload.to) }));
  }
  if (resource === "schedules" && method === "POST") {
    await requireRole(client, ["admin"]);
    const values = { code: text(payload.code).toUpperCase(), origin: text(payload.origin).toUpperCase(),
      destination: text(payload.destination).toUpperCase(), aircraft_id: text(payload.aircraftId),
      departure: text(payload.departure), arrival: text(payload.arrival),
      sale_start: text(payload.saleStart), sale_end: text(payload.saleEnd) };
    if (Object.values(values).some((value) => !value)) throw new ApiError("Completá ruta, avión, horarios y temporada");
    return unwrap(await client.from("flight_schedules").insert(values).select("*").single());
  }
  if (resource === "schedules" && ["PATCH", "DELETE"].includes(method)) {
    await requireRole(client, ["admin"]);
    if (method === "DELETE" || payload.restore === true) {
      return unwrap(await client.rpc("sigv_manage_flight_schedule", {
        p_schedule_id: text(payload.id), p_action: method === "DELETE" ? "delete" : "restore", p_payload: {},
      }));
    }
    const updates: Json = {};
    if (method === "PATCH") {
      for (const [from, to] of Object.entries({ origin: "origin", destination: "destination", aircraftId: "aircraft_id",
        departure: "departure", arrival: "arrival", saleStart: "sale_start", saleEnd: "sale_end", status: "status" })) {
        if (payload[from] !== undefined) updates[to] = payload[from];
      }
      if (payload.restore === true) updates.archived_at = null;
    }
    if (!Object.keys(updates).length) throw new ApiError("No hay cambios válidos");
    return unwrap(await client.from("flight_schedules").update(updates).eq("id", text(payload.id)).select("*").single());
  }
  if (resource === "frequencies" && method === "POST") {
    await requireRole(client, ["admin"]);
    const weekday = Number(payload.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new ApiError("Día inválido");
    return unwrap(await client.from("schedule_frequencies").insert({ schedule_id: text(payload.scheduleId), weekday }).select("*").single());
  }
  if (resource === "frequencies" && method === "DELETE") {
    await requireRole(client, ["admin"]);
    return unwrap(await client.from("schedule_frequencies").delete().eq("schedule_id", text(payload.scheduleId))
      .eq("weekday", Number(payload.weekday)).select("*").single());
  }
  if (resource === "configurations" && ["POST", "PATCH"].includes(method)) {
    await requireRole(client, ["admin"]);
    const cabin = text(payload.cabin);
    if (!["Economy", "Primera"].includes(cabin)) throw new ApiError("Cabina inválida");
    const values = { schedule_id: text(payload.scheduleId), cabin,
      capacity: positiveNumber(payload.capacity, "La capacidad"), price: positiveNumber(payload.price, "La tarifa") };
    if (!Number.isInteger(values.capacity)) throw new ApiError("La capacidad debe ser entera");
    if (method === "POST") return unwrap(await client.from("schedule_configurations").insert(values).select("*").single());
    return unwrap(await client.from("schedule_configurations").update({ capacity: values.capacity, price: values.price })
      .eq("schedule_id", values.schedule_id).eq("cabin", cabin).select("*").single());
  }
  if (resource === "configurations" && method === "DELETE") {
    await requireRole(client, ["admin"]);
    return unwrap(await client.from("schedule_configurations").delete().eq("schedule_id", text(payload.scheduleId))
      .eq("cabin", text(payload.cabin)).select("*").single());
  }
  if (resource === "seats" && method === "PATCH") {
    await requireRole(client, ["admin"]);
    const status = text(payload.status);
    if (!["Disponible", "Bloqueado"].includes(status)) throw new ApiError("Estado de asiento inválido");
    return unwrap(await client.from("flight_seats").update({ status }).eq("id", text(payload.id)).select("*").single());
  }
  if (resource === "reservations" && method === "POST") {
    await requireUser(client);
    const passengers = payload.passengers;
    const count = Number(payload.passengerCount);
    if (!Array.isArray(passengers) || !Number.isInteger(count) || count < 1 || count > 9 || passengers.length !== count)
      throw new ApiError("La compra admite entre 1 y 9 pasajeros identificados");
    const contactEmail = normalizeEmail(text(payload.contactEmail));
    const contactPhone = normalizePhone(text(payload.contactPhone));
    const contactProblem = emailProblem(contactEmail) ?? phoneProblem(contactPhone);
    if (contactProblem) throw new ApiError(contactProblem);
    const normalizedPassengers = passengers.map((person: Json) => {
      const firstName = text(person?.firstName);
      const lastName = text(person?.lastName);
      const document = normalizeDocument(text(person?.document));
      const personProblem = !firstName || !lastName ? "Completá nombre, apellido y documento de cada pasajero" : documentProblem(document);
      if (personProblem) throw new ApiError(personProblem);
      return { ...person, firstName, lastName, document };
    });
    if (new Set(normalizedPassengers.map((person: Json) => String(person.document).toLowerCase())).size !== count)
      throw new ApiError("Cada pasajero debe tener un documento diferente");
    if (text(payload.returnFlightId)) return unwrap(await client.rpc("sigv_reserve_round_trip", {
      p_flight_id: text(payload.flightId), p_cabin: text(payload.cabin),
      p_return_flight_id: text(payload.returnFlightId), p_return_cabin: text(payload.returnCabin), p_passengers: normalizedPassengers,
      p_contact_email: contactEmail, p_contact_phone: contactPhone || null,
    }));
    return unwrap(await client.rpc("sigv_reserve", { p_flight_id: text(payload.flightId), p_cabin: text(payload.cabin), p_passengers: normalizedPassengers, p_contact_email: contactEmail, p_contact_phone: contactPhone || null }));
  }
  if (resource === "reservations" && method === "DELETE") {
    await requireUser(client);
    return unwrap(await client.rpc("sigv_cancel_reservation", { p_code: text(payload.reservationCode) }));
  }
  if (resource === "payments" && method === "PATCH" && payload.action === "refund") {
    await requireRole(client, ["admin"]);
    return unwrap(await client.rpc("sigv_refund_reservation", { p_code: text(payload.reservationCode) }));
  }
  if (resource === "payments" && method === "POST") {
    await requireUser(client);
    const code = text(payload.reservationCode);
    const returnCode = text(payload.returnReservationCode);
    const result = unwrap(await client.rpc("sigv_simulated_checkout", { p_code: code, p_method: text(payload.method),
      p_card_number: typeof payload.cardNumber === "string" ? payload.cardNumber : null, p_return_code: returnCode || null })) as Json;
    if (result.status === "RECHAZADO" || result.replayed === true) return result;
    return { ...result, receiptEmail: await scheduleReceiptEmail(client, returnCode ? [code, returnCode] : [code]) };
  }
  if (resource === "receipts" && method === "POST") {
    const userId = await requireUser(client);
    const legs = await loadReceipts(client, [text(payload.reservationCode)]);
    if (!legs[0] || legs[0].ownerId !== userId || legs[0].status !== "Confirmada" || !legs[0].invoice) throw new ApiError("Reserva confirmada no encontrada", 404);
    if (!mailConfigured()) throw new ApiError("El envío de correos no está configurado en este entorno.", 503);
    try {
      return { reservationCode: legs[0].reservationCode, sentTo: await sendReceiptEmail(legs) };
    } catch (error) {
      console.error("Receipt email failed", error);
      throw new ApiError("No se pudo enviar el correo. Intentá nuevamente en unos minutos.", 502);
    }
  }
  if (resource === "check-in" && method === "POST") {
    await requireRole(client, ["admin", "mostrador"]);
    return unwrap(await client.rpc("sigv_check_in", { p_code: text(payload.reservationCode), p_document: text(payload.document), p_seat: text(payload.seat).toUpperCase(), p_baggage_kg: positiveNumber(payload.baggageKg, "El equipaje") }));
  }
  if (resource === "airports" && method === "POST") {
    await requireRole(client, ["admin"]);
    const code = text(payload.code).toUpperCase();
    const city = text(payload.city);
    const name = text(payload.name);
    if (!/^[A-Z]{3}$/.test(code) || !city || !name) throw new ApiError("Completá código IATA, ciudad y nombre");
    return unwrap(await client.from("airports").insert({ code, city, name }).select("*").single());
  }
  if (resource === "airports" && method === "PATCH") {
    await requireRole(client, ["admin"]);
    const updates: Json = {};
    if (payload.city !== undefined) updates.city = text(payload.city);
    if (payload.name !== undefined) updates.name = text(payload.name);
    if (payload.restore === true) updates.archived_at = null;
    if (!Object.keys(updates).length) throw new ApiError("No hay cambios válidos");
    return unwrap(await client.from("airports").update(updates).eq("code", text(payload.code).toUpperCase()).select("*").single());
  }
  if (resource === "airports" && method === "DELETE") {
    await requireRole(client, ["admin"]);
    return unwrap(await client.from("airports").update({ archived_at: new Date().toISOString() }).eq("code", text(payload.code).toUpperCase()).is("archived_at", null).select("*").single());
  }
  if (resource === "profile" && method === "PATCH") {
    const userId = await requireUser(client);
    const name = text(payload.name);
    const document = normalizeDocument(text(payload.document));
    const phone = normalizePhone(text(payload.phone));
    const problem = name.trim() ? documentProblem(document) ?? phoneProblem(phone) : "Ingresá tu nombre completo.";
    if (problem) throw new ApiError(problem);
    const updates = { name: name.trim(), phone, document };
    return unwrap(await client.from("profiles").update(updates).eq("user_id", userId).select("name,email,phone,document").single());
  }
  if (resource === "flights" && method === "POST") {
    await requireRole(client, ["admin"]);
    const economy = Number(payload.economy);
    const first = Number(payload.first);
    const seatsEconomy = Number(payload.seatsEconomy);
    const seatsFirst = Number(payload.seatsFirst);
    if (!text(payload.flightCode) || !text(payload.origin) || !text(payload.destination) || !text(payload.date)
      || !text(payload.departure) || !text(payload.arrival) || ![economy, first, seatsEconomy, seatsFirst].every(Number.isFinite))
      throw new ApiError("Completá código, ruta, fecha, horarios, tarifas y cupos");
    const row = unwrap(await client.from("flights").insert({
      id: text(payload.flightCode).toUpperCase(), origin: text(payload.origin).toUpperCase(),
      destination: text(payload.destination).toUpperCase(), flight_date: text(payload.date),
      departure: text(payload.departure), arrival: text(payload.arrival), economy, first,
      seats_economy: seatsEconomy, seats_first: seatsFirst,
      capacity_economy: seatsEconomy, capacity_first: seatsFirst,
    }).select("*").single());
    return flightDto(row as unknown as Json);
  }
  if (resource === "flights" && method === "DELETE") {
    await requireRole(client, ["admin"]);
    const row = unwrap(await client.from("flights").update({ archived_at: new Date().toISOString() }).eq("id", text(payload.flightId)).is("archived_at", null).select("*").single());
    return flightDto(row as unknown as Json);
  }
  if (resource === "flights" && method === "PATCH") {
    await requireRole(client, ["admin"]);
    const updates: Json = {};
    for (const [from, to] of Object.entries({ origin: "origin", destination: "destination", date: "flight_date", departure: "departure", arrival: "arrival", status: "status", gate: "gate" })) {
      if (payload[from] !== undefined) updates[to] = payload[from];
    }
    if (payload.restore === true) updates.archived_at = null;
    if (payload.reason !== undefined || ["status", "date", "departure", "arrival"].some((field) => payload[field] !== undefined))
      updates.reason = reasonValue(payload.reason);
    if (!Object.keys(updates).length) throw new ApiError("No hay cambios válidos");
    const row = unwrap(await client.rpc("sigv_apply_flight_change", { p_flight_id: text(payload.flightId), p_changes: updates }));
    scheduleFlightMail(client);
    return flightDto(row as unknown as Json);
  }
  if (["capacities", "fares"].includes(resource) && method === "PATCH") {
    await requireRole(client, ["admin"]);
    const flightId = text(payload.flightId);
    if (!flightId) throw new ApiError("Falta el código de vuelo");
    if (resource === "fares") {
      const updates = { economy: positiveNumber(payload.economy, "La tarifa Economy"), first: positiveNumber(payload.first, "La tarifa Primera") };
      return flightDto(unwrap(await client.from("flights").update(updates).eq("id", flightId).select("*").single()));
    }
    const economy = positiveNumber(payload.economy, "El cupo Economy");
    const first = positiveNumber(payload.first, "El cupo Primera");
    if (!Number.isInteger(economy) || !Number.isInteger(first)) throw new ApiError("Los cupos deben ser enteros");
    return unwrap(await client.rpc("sigv_set_capacity", { p_flight_id: flightId, p_economy: economy, p_first: first }));
  }
  if (resource === "disruptions" && method === "PATCH") {
    await requireRole(client, ["admin"]);
    const status = text(payload.status);
    if (!["Activo", "Retrasado", "Cancelado", "Reprogramado", "Operado"].includes(status)) throw new ApiError("Estado inválido");
    const updates: Json = { status, reason: reasonValue(payload.reason) };
    if (payload.date !== undefined) updates.flight_date = text(payload.date);
    if (payload.departure !== undefined) updates.departure = text(payload.departure);
    if (payload.arrival !== undefined) updates.arrival = text(payload.arrival);
    if ((updates.flight_date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(updates.flight_date)))
      || [updates.departure, updates.arrival].some((value) => value !== undefined && !/^\d{2}:\d{2}$/.test(String(value))))
      throw new ApiError("Ingresá la nueva fecha y los horarios de salida y llegada");
    if (updates.departure !== undefined && updates.departure === updates.arrival) throw new ApiError("Los horarios de salida y llegada deben ser diferentes");
    unwrap(await client.rpc("sigv_close_due_flights"));
    const flight = flightDto(unwrap(await client.rpc("sigv_apply_flight_change", { p_flight_id: text(payload.flightId), p_changes: updates })));
    scheduleFlightMail(client);
    return flight;
  }
  if (resource === "users" && method === "PATCH") {
    await requireRole(client, ["admin"]);
    const role = text(payload.role);
    if (!["pasajero", "admin", "mostrador"].includes(role)) throw new ApiError("Rol inválido");
    return unwrap(await client.from("user_roles").update({ role }).eq("user_id", text(payload.userId)).select("user_id,role").single());
  }
  if (resource === "notifications" && method === "PATCH") {
    const userId = await requireUser(client);
    return unwrap(await client.from("notifications").update({ read_at: new Date().toISOString() })
      .eq("id", text(payload.id)).eq("owner_id", userId).select("id,read_at").single());
  }
  throw new ApiError("Operación no disponible para este recurso", 405);
}
