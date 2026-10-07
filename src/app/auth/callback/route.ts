import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth-navigation";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNextPath(request.nextUrl.searchParams.get("next")) || "/pasajero/buscar-vuelos", request.url));
  }
  const query = new URLSearchParams({ error: "confirmacion" });
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  if (next) query.set("next", next);
  return NextResponse.redirect(new URL(`/ingresar?${query}`, request.url));
}
