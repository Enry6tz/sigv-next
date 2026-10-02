"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SupabaseAuthForm({ mode, nextPath }: { mode: "signin" | "signup"; nextPath?: string }) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const supabase = createClient();
    try {
      if (mode === "signup") {
        const firstName = String(form.get("firstName") ?? "").trim();
        const lastName = String(form.get("lastName") ?? "").trim();
        const document = String(form.get("document") ?? "").trim();
        const phone = String(form.get("phone") ?? "").trim();
        if (!firstName || !lastName || !document) throw new Error("Completá nombre, apellido y documento.");
        const { data, error: authError } = await supabase.auth.signUp({
          email, password,
          options: {
            data: { first_name: firstName, last_name: lastName, document, phone },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (authError) throw authError;
        if (data.session) {
          router.push("/pasajero/inicio");
          router.refresh();
        } else {
          setMessage("Cuenta creada. Revisá tu correo para confirmar el acceso.");
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        const { data: role } = await supabase.rpc("sigv_role");
        const home = role === "admin" ? "/admin/inicio" : role === "mostrador" ? "/mostrador/inicio" : "/pasajero/inicio";
        router.push(nextPath?.startsWith("/") && !nextPath.startsWith("//") ? nextPath : home);
        router.refresh();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo completar el acceso.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="stack-form" onSubmit={submit}>
    {mode === "signup" && <div className="form-row">
      <label>Nombre<input name="firstName" autoComplete="given-name" required /></label>
      <label>Apellido<input name="lastName" autoComplete="family-name" required /></label>
    </div>}
    {mode === "signup" && <div className="form-row">
      <label>DNI / documento<input name="document" autoComplete="off" required /></label>
      <label>Teléfono<input name="phone" type="tel" autoComplete="tel" /></label>
    </div>}
    <label>Correo electrónico<input name="email" type="email" autoComplete="email" required /></label>
    <label>Contraseña<input name="password" type="password" minLength={6} autoComplete={mode === "signup" ? "new-password" : "current-password"} required /></label>
    <button className="button dark" type="submit" disabled={busy}>{busy ? "Procesando…" : mode === "signup" ? "Crear cuenta" : "Iniciar sesión"}</button>
    {error && <p className="error-text" role="alert">{error}</p>}
    {message && <p className="form-status" role="status">{message}</p>}
  </form>;
}

export function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }
  return <button className="header-exit" type="button" onClick={signOut}>Cerrar sesión</button>;
}
