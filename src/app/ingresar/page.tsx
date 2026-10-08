import Link from "next/link";
import { appSprint, dataProvider } from "@/lib/sprint";
import { SupabaseAuthForm } from "@/components/supabase-auth-form";
import { safeNextPath } from "@/lib/auth-navigation";
import { describeAuthCallbackError } from "@/lib/auth-errors";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; error_code?: string; error_description?: string }> }) {
  const query = await searchParams;
  const live = dataProvider === "supabase";
  const errorHint = describeAuthCallbackError(new URLSearchParams(query as Record<string, string>)) ?? undefined;
  return <div className="auth-shell"><section className="auth-art"><Link href="/" className="brand inverse"><span className="brand-mark">✈</span><span><strong>SIGV</strong><small>AEROLÍNEA NACIONAL</small></span></Link><div><p className="kicker light">BIENVENIDO A BORDO</p><h1>Todo tu viaje, en un solo lugar.</h1><p>Ingresá para consultar reservas, pasajes y novedades de tus vuelos.</p></div><small>{live ? "Acceso seguro con Supabase Auth" : "Entorno de prueba · sin cuentas reales"}</small></section><main className="auth-main"><div className="auth-card"><p className="kicker">{live ? "TU CUENTA SIGV" : "ACCESO DE DEMOSTRACIÓN"}</p><h1>Iniciar sesión</h1>{live ? <><p>Ingresá con tu correo y contraseña.</p><SupabaseAuthForm mode="signin" nextPath={query.next} errorHint={errorHint} /></> : <><p>Elegí un perfil para recorrer el prototipo del sprint {appSprint}.</p><div className="demo-roles"><Link href={safeNextPath(query.next) || "/pasajero/inicio"}>Entrar como pasajero <span>→</span></Link><Link href="/admin/inicio">Entrar como administrador <span>→</span></Link>{appSprint >= 2 && <Link href="/mostrador/inicio">Entrar como mostrador <span>→</span></Link>}</div></>}<div className="auth-links"><Link href={safeNextPath(query.next) ? `/registro?${new URLSearchParams({ next: safeNextPath(query.next)! })}` : "/registro"}>Crear cuenta</Link><Link href="/">Volver al buscador</Link></div></div></main></div>;
}
