import { appSprint, dataProvider } from "@/lib/sprint";
import { readResource } from "@/lib/supabase/resources";
import { publicError } from "@/lib/api-errors";
import { occupancyCsv, type OccupancyRow } from "@/lib/occupancy-report";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (appSprint < 3 || dataProvider !== "supabase") return new Response("No disponible", { status: 404 });
  try {
    const rows = await readResource("reports", new URL(request.url).searchParams) as OccupancyRow[];
    return new Response(occupancyCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=SIGV-ocupacion.csv", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    const { message, status } = publicError(error);
    return new Response(message, { status });
  }
}
