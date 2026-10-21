import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appSprint, dataProvider } from "@/lib/sprint";
import { resourceSprint } from "@/lib/catalog";
import { eticketFilename, invoiceFilename, loadReceipts, renderInvoice } from "@/lib/receipts";
import { eticketPdf } from "@/lib/receipt-pdf";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Comprobante no encontrado", { status: 404 });

function pdf(bytes: Uint8Array, filename: string) {
  return new Response(new Uint8Array(bytes), { headers: {
    "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}

// GET /api/receipts/{reserva}?doc=factura | ?doc=eticket&passenger={id}
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  if (appSprint < resourceSprint.invoices || dataProvider !== "supabase") return new Response("No disponible", { status: 404 });
  const { code } = await params;
  if (!/^[A-Za-z0-9-]{1,40}$/.test(code)) return notFound();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return new Response("Iniciá sesión", { status: 401 });
  let leg;
  try {
    [leg] = await loadReceipts(supabase, [code]);
  } catch (error) {
    console.error("Receipt download failed", error);
    return new Response("No se pudo generar el comprobante", { status: 500 });
  }
  if (!leg || leg.ownerId !== claims.claims.sub || !leg.invoice) return notFound();

  const doc = request.nextUrl.searchParams.get("doc");
  if (doc === "factura") return pdf(await renderInvoice(leg), invoiceFilename(leg));
  if (doc === "eticket" && leg.status === "Confirmada") {
    const passenger = leg.passengers.find((person) => person.id === request.nextUrl.searchParams.get("passenger"));
    if (passenger) return pdf(await eticketPdf(leg, passenger), eticketFilename(leg, passenger));
  }
  return notFound();
}
