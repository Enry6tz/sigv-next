"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/auth-navigation";
import { LocalizedError, mapAuthError } from "@/lib/auth-errors";
import { normalizeDocument, normalizeEmail, normalizePhone, signupProblems } from "@/lib/identity-validation";

function emailRedirectTo(nextPath?: string) {
  const safe = safeNextPath(nextPath);
  return `${window.location.origin}/auth/callback${safe ? `?${new URLSearchParams({ next: safe })}` : ""}`;
}

export function SupabaseAuthForm({ mode, nextPath, errorHint }: { mode: "signin" | "signup"; nextPath?: string; errorHint?: string }) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [canResend, setCanResend] = useState(Boolean(errorHint));
  const [resending, setResending] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    setCanResend(false);
    const form = new FormData(event.currentTarget);
    const emailValue = normalizeEmail(String(form.get("email") ?? ""));
    setEmail(emailValue);
    const supabase = createClient();
    try {
      if (mode === "signup") {
        const firstName = String(form.get("firstName") ?? "").trim();
        const lastName = String(form.get("lastName") ?? "").trim();
        const document = normalizeDocument(String(form.get("document") ?? ""));
        const phone = normalizePhone(String(form.get("phone") ?? ""));
        const password = String(form.get("password") ?? "");
        const passwordAgain = String(form.get("passwordAgain") ?? "");
        const problem = signupProblems({ firstName, lastName, document, phone, email: emailValue, password, passwordAgain });
        if (problem) throw new LocalizedError(problem);
        const { data, error: authError } = await supabase.auth.signUp({
          email: emailValue, password,
          options: {
            data: { first_name: firstName, last_name: lastName, document, phone },
            emailRedirectTo: emailRedirectTo(nextPath),
          },
        });
        if (authError) throw authError;
        if (data.session) {
          router.push(safeNextPath(nextPath) || "/pasajero/buscar-vuelos");
          router.refresh();
        } else {
          setMessage("Cuenta creada. Revisá tu correo para confirmar el acceso.");
          setCanResend(true);
        }
      } else {
        const password = String(form.get("password") ?? "");
        const { error: authError } = await supabase.auth.signInWithPassword({ email: emailValue, password });
        if (authError) throw authError;
        let home = "/pasajero/inicio";
        try {
          const { data: role } = await supabase.rpc("sigv_role");
          if (role === "admin") home = "/admin/inicio";
          else if (role === "mostrador") home = "/mostrador/inicio";
        } catch {
          // Sin rol resuelto ingresá como pasajero: el layout vuelve a verificar permisos.
        }
        router.push(safeNextPath(nextPath) || home);
        router.refresh();
      }
    } catch (reason) {
      if (reason instanceof LocalizedError) {
        setError(reason.message);
      } else {
        setError(mapAuthError(reason));
        const code = (reason as { code?: string } | null)?.code ?? "";
        if (code === "email_not_confirmed") setCanResend(true);
      }
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (resending) return;
    setResending(true);
    setError("");
    setMessage("");
    try {
      const supabase = createClient();
      const { error: resendError } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: emailRedirectTo(nextPath) } });
      if (resendError) throw resendError;
      setMessage("Si el correo está registrado, enviamos un enlace nuevo de confirmación.");
      setCanResend(true);
    } catch (reason) {
      setError(mapAuthError(reason));
    } finally {
      setResending(false);
    }
  }

  return <form className="stack-form" onSubmit={submit}>
    {mode === "signup" && <div className="form-row">
      <label>Nombre<input name="firstName" autoComplete="given-name" required /></label>
      <label>Apellido<input name="lastName" autoComplete="family-name" required /></label>
    </div>}
    {mode === "signup" && <div className="form-row">
      <label>DNI / documento<input name="document" inputMode="numeric" autoComplete="off" pattern="[0-9]{6,8}" title="Entre 6 y 8 dígitos, sin letras ni espacios" required /></label>
      <label>Teléfono<input name="phone" type="tel" autoComplete="tel" /></label>
    </div>}
    <label>Correo electrónico<input name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
    <label>Contraseña<input name="password" type="password" minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} required /></label>
    {mode === "signup" && <label>Repetí la contraseña<input name="passwordAgain" type="password" minLength={8} autoComplete="new-password" required /></label>}
    <button className="button dark" type="submit" disabled={busy || resending}>{busy ? "Procesando…" : mode === "signup" ? "Crear cuenta" : "Iniciar sesión"}</button>
    {mode === "signup" && <p className="form-hint">Mínimo 8 caracteres con letras y números.</p>}
    {errorHint && !message && !error && <p className="form-status" role="status">{errorHint}</p>}
    {error && <p className="error-text" role="alert">{error}</p>}
    {message && <p className="form-status" role="status">{message}</p>}
    {canResend && <button className="button" type="button" onClick={() => void resend()} disabled={resending || !email}>{resending ? "Enviando…" : "Reenviar correo de confirmación"}</button>}
    {canResend && !email && <p className="form-hint">Ingresá tu correo arriba para reenviar el enlace.</p>}
  </form>;
}

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Aunque falle el cierre en el servidor, salimos de la vista local.
    } finally {
      router.replace("/");
      router.refresh();
      setBusy(false);
    }
  }
  return <button className="header-exit" type="button" onClick={() => void signOut()} disabled={busy}>{busy ? "Saliendo…" : "Cerrar sesión"}</button>;
}
