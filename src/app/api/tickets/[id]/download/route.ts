import { createClient } from "@/lib/supabase/server";
import { appSprint, dataProvider } from "@/lib/sprint";

export const dynamic = "force-dynamic";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (appSprint < 3 || dataProvider !== "supabase") return new Response("No disponible", { status: 404 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Ticket no encontrado", { status: 404 });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return new Response("Iniciá sesión", { status: 401 });
  const { data, error } = await supabase.from("reservation_passengers")
    .select("id,first_name,last_name,seat,reservations!inner(code,flight_id,status,owner_id)")
    .eq("id", id).single();
  if (error || !data) return new Response("Ticket no encontrado", { status: 404 });
  const reservation = data.reservations as unknown as { code: string; flight_id: string; status: string; owner_id: string };
  if (reservation.owner_id !== claims.claims.sub || reservation.status !== "Confirmada")
    return new Response("Ticket no encontrado", { status: 404 });

  const rows: [string, string][] = [["Reserva", reservation.code], ["Vuelo", reservation.flight_id],
    ["Pasajero", `${data.first_name} ${data.last_name}`], ["Asiento", data.seat ?? "Pendiente"],
    ["Estado al descargar", "Vigente"]];
  const details = rows.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Ticket SIGV ${escapeHtml(reservation.code)}</title><style>body{font:16px system-ui;max-width:34rem;margin:3rem auto;padding:1.5rem;color:#202020}header{border-bottom:3px solid #202020;padding-bottom:1rem}h1{font-size:2rem}dl{display:grid;grid-template-columns:1fr 2fr;gap:.8rem;padding:1.5rem;border:1px solid #bbb}dt{color:#666}dd{margin:0;font-weight:700}small{color:#666}</style></head><body><header><strong>✈ SIGV · AEROLÍNEA NACIONAL</strong><h1>Ticket digital</h1></header><dl>${details}</dl><small>Copia guardada para consulta sin conexión. Confirmá el estado del vuelo en SIGV antes de viajar.</small></body></html>`;
  const filename = `SIGV-${reservation.code.replace(/[^A-Za-z0-9_-]/g, "")}.html`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
