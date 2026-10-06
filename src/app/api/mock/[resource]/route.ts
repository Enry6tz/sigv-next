import { NextRequest, NextResponse } from "next/server";
import { airports, flights, mockCollections, reservation } from "@/lib/mock-data";
import { resourceSprint } from "@/lib/catalog";
import { appSprint, dataProvider } from "@/lib/sprint";
import { ApiError, readResource, writeResource } from "@/lib/supabase/resources";
import { publicError } from "@/lib/api-errors";
import { countDepartures, validateFlightSchedule, type Aircraft } from "@/lib/flight-schedule";
import { adminFlightDto } from "@/lib/admin-flights";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ resource: string }> };

function gate(resource: string) {
  const minSprint = resourceSprint[resource];
  if (!minSprint) return NextResponse.json({ error: "Recurso desconocido" }, { status: 404 });
  if (appSprint < minSprint) return NextResponse.json({ error: "No disponible en este sprint", code: "SPRINT_DISABLED", requiredSprint: minSprint }, { status: 404 });
  return null;
}

function liveError(error: unknown) {
  const { status, message } = publicError(error);
  if (!(error instanceof ApiError)) console.error("API operation failed", error);
  return NextResponse.json({ error: message, mode: "supabase" }, { status });
}

export async function GET(request: NextRequest, context: Context) {
  const { resource } = await context.params;
  const blocked = gate(resource);
  if (blocked) return blocked;
  if (dataProvider === "supabase") {
    try {
      const data = await readResource(resource, request.nextUrl.searchParams);
      return NextResponse.json({ mode: "supabase", sprint: appSprint, resource, data }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
      return liveError(error);
    }
  }
  let data = mockCollections[resource] ?? [];
  if (resource === "admin-flights") data = flights.map((flight) => adminFlightDto({
    id: flight.id, code: flight.id, origin: flight.origin, destination: flight.destination,
    aircraft_id: null, aircraft: null, departure: flight.departure, arrival: flight.arrival,
    sale_start: flight.date, sale_end: flight.date, status: flight.status === "Cancelado" ? "Suspendida" : "Activa",
    schedule_frequencies: [{ weekday: new Date(`${flight.date}T12:00:00Z`).getUTCDay() }],
    schedule_configurations: [{ cabin: "Economy", capacity: flight.seatsEconomy, price: flight.economy },
      { cabin: "Primera", capacity: flight.seatsFirst, price: flight.first }],
  }));
  if (resource === "flights") {
    const origin = request.nextUrl.searchParams.get("origin")?.toUpperCase();
    const destination = request.nextUrl.searchParams.get("destination")?.toUpperCase();
    const date = request.nextUrl.searchParams.get("date");
    data = flights.filter((flight) =>
      (!origin || flight.origin === origin) &&
      (!destination || flight.destination === destination) &&
      (!date || flight.date === date)
    );
  }
  if (resource === "airports") data = airports;
  return NextResponse.json({ mode: "mock", sprint: appSprint, resource, data }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, context: Context) {
  const { resource } = await context.params;
  const blocked = gate(resource);
  if (blocked) return blocked;
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("bad payload");
  } catch {
    return NextResponse.json({ error: "Se requiere un objeto JSON válido" }, { status: 400 });
  }
  if (dataProvider === "supabase") {
    try {
      const data = await writeResource(resource, "POST", payload);
      return NextResponse.json({ mode: "supabase", persisted: true, resource, data }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
      return liveError(error);
    }
  }

  if (resource === "flights" && payload.action === "publish") {
    const aircraft = (mockCollections.aircraft as Aircraft[]).find((plane) => plane.id === payload.aircraftId);
    const invalid = validateFlightSchedule(payload, aircraft);
    if (invalid || !aircraft) return NextResponse.json({ error: invalid ?? "Seleccioná una aeronave disponible." }, { status: 400 });
    if (![payload.origin, payload.destination].every((code) => airports.some((airport) => airport.code === String(code).trim().toUpperCase())))
      return NextResponse.json({ error: "Seleccioná los aeropuertos de origen y destino." }, { status: 400 });
    return NextResponse.json({ mode: "mock", persisted: false, data: {
      created: countDepartures(String(payload.saleStart), String(payload.saleEnd), payload.weekdays as number[]),
    } }, { status: 202 });
  }
  if (resource === "reservations") {
    const count = Number(payload.passengerCount);
    if (!Number.isInteger(count) || count < 1 || count > 9) {
      return NextResponse.json({ error: "La compra admite entre 1 y 9 pasajeros" }, { status: 400 });
    }
    const passengers = payload.passengers;
    if (!Array.isArray(passengers) || passengers.length !== count || passengers.some((p) => !p || typeof p !== "object" || !p.firstName || !p.lastName || !p.document)) {
      return NextResponse.json({ error: "Completá nombre, apellido y DNI de cada pasajero" }, { status: 400 });
    }
    if (!flights.some((f) => f.id === payload.flightId && f.status !== "Cancelado")) {
      return NextResponse.json({ error: "Vuelo no disponible" }, { status: 400 });
    }
    return NextResponse.json({ mode: "mock", persisted: false, data: { ...reservation, code: `DEMO-${Date.now().toString(36).toUpperCase()}`, flightId: payload.flightId, cabin: payload.cabin, seats: count, status: "Pendiente de pago" } }, { status: 202 });
  }
  if (resource === "check-in") {
    if (!payload.reservationCode || !Number.isFinite(Number(payload.baggageKg)) || Number(payload.baggageKg) < 0) return NextResponse.json({ error: "Ingresá reserva y peso válido" }, { status: 400 });
    return NextResponse.json({ mode: "mock", persisted: false, data: { reservationCode: payload.reservationCode, seat: payload.seat ?? "12A", baggageKg: payload.baggageKg, boardingPass: "BP-DEMO-1420" } }, { status: 202 });
  }
  if (resource === "payments") {
    if (!payload.reservationCode) return NextResponse.json({ error: "Falta el código de reserva" }, { status: 400 });
    return NextResponse.json({ mode: "mock", persisted: false, data: { reservationCode: payload.reservationCode, status: "Aprobado (simulado)", invoice: "FAC-DEMO-2026-001" } }, { status: 202 });
  }
  return NextResponse.json({ mode: "mock", persisted: false, resource, data: { acceptedFields: Object.keys(payload).filter((key) => key !== "password"), status: "Recibido en simulación" } }, { status: 202 });
}

export async function PATCH(request: NextRequest, context: Context) {
  const { resource } = await context.params;
  const blocked = gate(resource);
  if (blocked) return blocked;
  if (!["admin-flights", "flights", "airports", "aircraft", "schedules", "configurations", "seats", "capacities", "fares", "profile", "users", "reservations", "disruptions", "notifications"].includes(resource)) {
    return NextResponse.json({ error: "Operación no disponible para este recurso" }, { status: 405 });
  }
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("bad payload");
  } catch {
    return NextResponse.json({ error: "Se requiere un objeto JSON válido" }, { status: 400 });
  }
  if (dataProvider === "supabase") {
    try {
      const data = await writeResource(resource, "PATCH", payload);
      return NextResponse.json({ mode: "supabase", persisted: true, resource, data }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
      return liveError(error);
    }
  }
  return NextResponse.json({ mode: "mock", persisted: false, resource, data: { acceptedFields: Object.keys(payload).filter((key) => key !== "password"), status: "Cambio simulado" } }, { status: 202 });
}

export async function DELETE(request: NextRequest, context: Context) {
  const { resource } = await context.params;
  const blocked = gate(resource);
  if (blocked) return blocked;
  if (!["flights", "admin-flights"].includes(resource) && !(dataProvider === "supabase" && ["reservations", "airports", "aircraft", "schedules", "frequencies", "configurations"].includes(resource))) return NextResponse.json({ error: "Operación no disponible para este recurso" }, { status: 405 });
  let payload: { id?: string; flightId?: string; reservationCode?: string };
  try {
    payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("bad payload");
  } catch {
    return NextResponse.json({ error: "Se requiere un código de vuelo" }, { status: 400 });
  }
  if (dataProvider === "supabase") {
    try {
      const data = await writeResource(resource, "DELETE", payload);
      return NextResponse.json({ mode: "supabase", persisted: true, resource, data }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
      return liveError(error);
    }
  }
  if (!flights.some((flight) => flight.id === (resource === "admin-flights" ? payload.id : payload.flightId))) return NextResponse.json({ error: "Vuelo no encontrado" }, { status: 404 });
  return NextResponse.json({ mode: "mock", persisted: false, data: { flightId: payload.flightId, status: "Cancelación simulada" } }, { status: 202 });
}
