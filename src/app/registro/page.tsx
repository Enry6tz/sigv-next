import Link from "next/link";
import { SimpleMockForm } from "@/components/simple-mock-form";
import { SupabaseAuthForm } from "@/components/supabase-auth-form";
import { dataProvider } from "@/lib/sprint";

export default function Register() {
  const live = dataProvider === "supabase";
  return <div className="auth-shell"><section className="auth-art"><Link href="/" className="brand inverse"><span className="brand-mark">✈</span><span><strong>SIGV</strong><small>AEROLÍNEA NACIONAL</small></span></Link><div><p className="kicker light">TU CUENTA</p><h1>Prepará tu próximo viaje.</h1><p>{live ? "Creá tu cuenta para reservar y seguir tus vuelos. Confirmarás el correo antes de ingresar." : "El registro y la validación de correo están representados con respuestas simuladas."}</p></div><small>{live ? "Registro con Supabase Auth" : "Datos ficticios únicamente"}</small></section><main className="auth-main"><div className="auth-card"><p className="kicker">PASAJEROS</p><h1>Crear cuenta</h1>{live ? <SupabaseAuthForm mode="signup" /> : <SimpleMockForm resource="auth" fields={[{ name: "firstName", label: "Nombre" }, { name: "lastName", label: "Apellido" }, { name: "document", label: "DNI / documento" }, { name: "phone", label: "Teléfono", type: "tel" }, { name: "email", label: "Correo electrónico", type: "email" }, { name: "password", label: "Contraseña", type: "password" }]} button="Crear cuenta de prueba" />}<div className="auth-links"><Link href="/ingresar">Ya tengo cuenta</Link><Link href="/">Volver al buscador</Link></div></div></main></div>;
}
