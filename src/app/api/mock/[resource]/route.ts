import { NextRequest, NextResponse } from "next/server";
import { airports, flights, mockCollections, reservation } from "@/lib/mock-data";
import { resourceSprint } from "@/lib/catalog";
import { appSprint, dataProvider } from "@/lib/sprint";
import { ApiError, readResource, writeResource } from "@/lib/supabase/resources";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ resource: string }> };

function gate(resource: string) {
  const minSprint = resourceSprint[resource];
  if (!minSprint) return NextResponse.json({ error: "Recurso desconocido" }, { status: 404 });
  if (appSprint < minSprint) return NextResponse.json({ error: "No disponible en este sprint", code: "SPRINT_DISABLED", requiredSprint: minSprint }, { status: 404 });
  return null;
}

function liveError(error: unknown) {
  const status = error instanceof ApiError ? error.status : 500;
  const message = error instanceof Error ? error.message : "No se pudo consultar Supabase";
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
  if (!["flights", "airports", "aircraft", "schedules", "configurations", "seats", "capacities", "fares", "profile", "users", "reservations", "disruptions", "notifications"].includes(resource)) {
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
  if (resource !== "flights" && !(dataProvider === "supabase" && ["reservations", "airports", "aircraft", "schedules", "frequencies", "configurations"].includes(resource))) return NextResponse.json({ error: "Operación no disponible para este recurso" }, { status: 405 });
  let payload: { flightId?: string; reservationCode?: string };
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
  if (!flights.some((flight) => flight.id === payload.flightId)) return NextResponse.json({ error: "Vuelo no encontrado" }, { status: 404 });
  return NextResponse.json({ mode: "mock", persisted: false, data: { flightId: payload.flightId, status: "Cancelación simulada" } }, { status: 202 });
}
