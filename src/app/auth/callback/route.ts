import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth-navigation";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNextPath(params.get("next"));
  const code = params.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next || "/pasajero/buscar-vuelos", request.url));
  }
  // Enlace expirado, rechazado o intercambio fallido: conservamos el motivo para
  // que /ingresar muestre un mensaje específico y ofrezca reenviar el correo.
  const failure = params.get("error_code") ?? params.get("error") ?? "confirmacion";
  const query = new URLSearchParams({ error: failure });
  const description = params.get("error_description");
  if (description) query.set("error_description", description);
  if (next) query.set("next", next);
  return NextResponse.redirect(new URL(`/ingresar?${query}`, request.url));
}
