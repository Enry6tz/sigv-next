import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processorSecretMatches } from "@/lib/mail-outbox";
import { processFlightMail } from "@/lib/supabase/resources";
import { dataProvider } from "@/lib/sprint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

// Endpoint exclusivo del programador; el administrador usa /api/data/flight-mail.
export async function POST(request: NextRequest) {
  if (!processorSecretMatches(process.env.NOTIFICATION_PROCESSOR_SECRET, request.headers.get("authorization")))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (dataProvider !== "supabase") return NextResponse.json({ error: "El procesador requiere persistencia configurada" }, { status: 503 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "El procesador no está disponible" }, { status: 503 });
  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    return NextResponse.json(await processFlightMail(client), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "No se pudo procesar la cola; los pendientes se conservan" }, { status: 503 });
  }
}

export const GET = POST;
