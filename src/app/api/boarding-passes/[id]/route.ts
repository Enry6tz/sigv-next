import { createClient } from "@/lib/supabase/server";
import { appSprint, dataProvider } from "@/lib/sprint";
import { resourceSprint } from "@/lib/catalog";
import { displayFlightCode } from "@/lib/flight-code";
import { boardingPassCode, boardingPassPayload, qrMatrix } from "@/lib/boarding-pass";
import { boardingPassPdf } from "@/lib/receipt-pdf";

export const dynamic = "force-dynamic";

type Json = Record<string, unknown>;

// GET /api/boarding-passes/{pasajero}: tarjeta de embarque en PDF para entregar en forma digital (US-022).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (appSprint < resourceSprint["boarding-passes"] || dataProvider !== "supabase") return new Response("No disponible", { status: 404 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Pase no encontrado", { status: 404 });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return new Response("Iniciá sesión", { status: 401 });
  const { data: role } = await supabase.rpc("sigv_role");
  if (!["admin", "mostrador"].includes(role)) return new Response("No tenés permiso para esta operación", { status: 403 });
  const { data, error } = await supabase.from("reservation_passengers")
    .select("id,first_name,last_name,document,seat,checked_in_at,reservations!inner(code,cabin,status),flights(id,schedule_id,origin,destination,flight_date,departure,arrival)")
    .eq("id", id).maybeSingle();
  if (error) {
    console.error("Boarding pass download failed", error);
    return new Response("No se pudo generar el pase", { status: 500 });
  }
  const reservation = data?.reservations as unknown as Json | undefined;
  const flight = data?.flights as unknown as Json | undefined;
  if (!data || !reservation || !flight || reservation.status !== "Confirmada") return new Response("Pase no encontrado", { status: 404 });
  // Criterio 3: sin check-in con asiento confirmado no se emite el pase.
  if (!data.checked_in_at || !data.seat) return new Response("El pasajero todavía no tiene asiento asignado", { status: 409 });

  const code = boardingPassCode(String(data.id));
  const flightCode = displayFlightCode({ id: String(flight.id), scheduleId: typeof flight.schedule_id === "string" ? flight.schedule_id : null });
  const pass = {
    code, reservationCode: String(reservation.code), passenger: `${data.first_name} ${data.last_name}`,
    document: String(data.document), cabin: String(reservation.cabin), seat: String(data.seat),
    flight: { code: flightCode, origin: String(flight.origin), destination: String(flight.destination), date: String(flight.flight_date),
      departure: String(flight.departure).slice(0, 5), arrival: String(flight.arrival).slice(0, 5) },
  };
  const bytes = await boardingPassPdf(pass, qrMatrix(boardingPassPayload({ code, reservationCode: pass.reservationCode, flightCode, date: pass.flight.date, seat: pass.seat })));
  return new Response(new Uint8Array(bytes), { headers: {
    "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Boarding-pass-${code}.pdf"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}
