import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./server";
import { ApiError, databaseError } from "@/lib/api-errors";
import { validateFlightSchedule } from "@/lib/flight-schedule";
import { displayFlightCode } from "@/lib/flight-code";
import { adminFlightDto } from "@/lib/admin-flights";
export { ApiError } from "@/lib/api-errors";

type Client = SupabaseClient;
type Json = Record<string, unknown>;

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

function flightDto(row: Json) {
  return {
    id: row.id, origin: row.origin, destination: row.destination,
    code: displayFlightCode({ id: String(row.id), scheduleId: typeof row.schedule_id === "string" ? row.schedule_id : null }),
    date: row.flight_date, departure: String(row.departure).slice(0, 5),
    arrival: String(row.arrival).slice(0, 5), status: row.status,
    economy: Number(row.economy), first: Number(row.first),
    seatsEconomy: row.seats_economy, seatsFirst: row.seats_first,
    isDemo: row.is_demo, archivedAt: row.archived_at,
    baggageIncluded: row.baggage_included, seatSelectionEnabled: row.seat_selection_enabled,
    onlineCheckInEnabled: row.online_check_in_enabled,
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
    .select("id,code,flight_id,cabin,passenger_count,total_amount,status,created_at,reservation_passengers(id,first_name,last_name,document,seat,baggage_kg,checked_in_at)")
    .order("created_at", { ascending: false }));
  return rows.map((row: Json) => {
    const people = row.reservation_passengers as Json[];
    return {
      code: row.code, flightId: row.flight_id, cabin: row.cabin,
      seats: row.passenger_count, status: row.status, amount: Number(row.total_amount),
      passenger: people[0] ? `${people[0].first_name} ${people[0].last_name}` : "",
      document: people[0]?.document ?? "", passengers: people,
    };
  });
}

export async function readResource(resource: string, filters: URLSearchParams) {
  const client = await createClient();
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
    const row = unwrap(await client.from("profiles").select("name,email,phone,document").eq("user_id", userId).single());
    return row;
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
    return rows.map((row: Json) => ({ id: row.id, flightId: row.flight_id, actorId: row.actor_id,
      field: row.field, oldValue: row.old_value, newValue: row.new_value, changedAt: row.changed_at }));
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
      reservationCode: row.code, flightId: row.flight_id,
      passenger: `${person.first_name} ${person.last_name}`,
      document: person.document, seat: person.seat, baggageKg: person.baggage_kg,
      checkedIn: Boolean(person.checked_in_at),
      status: person.checked_in_at ? "Completado" : "Pendiente",
      boardingPass: person.checked_in_at ? `BP-${String(person.id).replaceAll("-", "").slice(0, 10).toUpperCase()}` : null,
    }))).filter((row) => resource !== "boarding-passes" || row.checkedIn);
  }
  if (resource === "tickets") {
    const rows = await reservations(client);
    return rows.filter((row) => row.status === "Confirmada")
      .flatMap((row) => row.passengers.map((person) => ({ id: person.id, reservationCode: row.code, flightId: row.flightId, passenger: `${person.first_name} ${person.last_name}`, seat: person.seat ?? "Pendiente", status: "Vigente", offline: false })));
  }
  if (resource === "disruptions") {
    await requireRole(client, ["admin"]);
    const allFlights = await flights(client);
    const allReservations = await reservations(client);
    return allFlights.map((row) => ({
      flightId: row.id, kind: row.status === "Cancelado" ? "Cancelación" : row.status === "Retrasado" ? "Retraso" : "Sin contingencia",
      affectedBookings: allReservations.filter((booking) => booking.flightId === row.id && booking.status !== "Cancelada").length,
      status: row.status,
    }));
  }
  if (resource === "reports") {
    await requireRole(client, ["admin"]);
    const rows = unwrap(await client.from("flights").select("id,seats_economy,seats_first,capacity_economy,capacity_first"));
    return rows.flatMap((row: Json) => [
      { flightId: row.id, cabin: "Economy", occupancy: Number(row.capacity_economy) ? Math.round((1 - Number(row.seats_economy) / Number(row.capacity_economy)) * 100) : 0 },
      { flightId: row.id, cabin: "Primera", occupancy: Number(row.capacity_first) ? Math.round((1 - Number(row.seats_first) / Number(row.capacity_first)) * 100) : 0 },
    ]);
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
    return unwrap(await client.rpc("sigv_reserve", { p_flight_id: text(payload.flightId), p_cabin: text(payload.cabin), p_passengers: passengers }));
  }
  if (resource === "reservations" && method === "DELETE") {
    await requireUser(client);
    return unwrap(await client.rpc("sigv_cancel_reservation", { p_code: text(payload.reservationCode) }));
  }
  if (resource === "payments" && method === "POST") {
    await requireUser(client);
    return unwrap(await client.rpc("sigv_demo_payment", { p_code: text(payload.reservationCode), p_method: text(payload.method) }));
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
    const updates = { name: text(payload.name), phone: text(payload.phone), document: text(payload.document) };
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
    if (!Object.keys(updates).length) throw new ApiError("No hay cambios válidos");
    const row = unwrap(await client.from("flights").update(updates).eq("id", text(payload.flightId)).select("*").single());
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
    if (!["Activo", "Retrasado", "Cancelado"].includes(status)) throw new ApiError("Estado inválido");
    const updates: Json = { status };
    if (payload.date !== undefined) updates.flight_date = text(payload.date);
    if (payload.departure !== undefined) updates.departure = text(payload.departure);
    if (payload.arrival !== undefined) updates.arrival = text(payload.arrival);
    return flightDto(unwrap(await client.from("flights").update(updates).eq("id", text(payload.flightId)).select("*").single()));
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
