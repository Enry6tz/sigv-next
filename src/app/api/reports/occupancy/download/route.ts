import { appSprint, dataProvider } from "@/lib/sprint";
import { readResource } from "@/lib/supabase/resources";
import { publicError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET() {
  if (appSprint < 3 || dataProvider !== "supabase") return new Response("No disponible", { status: 404 });
  try {
    const rows = await readResource("reports", new URLSearchParams()) as { flightId: string; cabin: string; occupancy: number }[];
    const cell = (value: string) => `"${(/^[=+@-]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}\"`;
    const csv = "Vuelo,Clase,Ocupación (%)\r\n" + rows.map((row) => [cell(row.flightId), cell(row.cabin), row.occupancy].join(",")).join("\r\n");
    return new Response(`\uFEFF${csv}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=SIGV-ocupacion.csv", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    const { message, status } = publicError(error);
    return new Response(message, { status });
  }
}
