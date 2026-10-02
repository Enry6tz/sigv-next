"use client";

import { useState, type FormEvent } from "react";

type Field = { name: string; label: string; type?: string };

export function SimpleMockForm({ resource, fields, button, live = false, onSuccess }: { resource: string; fields: Field[]; button: string; live?: boolean; onSuccess?: () => void }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/data/${resource}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
      const result = await response.json();
      setMessage(response.ok ? live ? "Cambios guardados en Supabase." : "Solicitud recibida en la simulación. No se guardaron datos ni se envió correo." : result.error ?? "No se pudo procesar la solicitud.");
      if (response.ok) onSuccess?.();
    } catch {
      setMessage("No se pudo conectar con la API.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="stack-form" onSubmit={submit}>
    {fields.map((field) => <label key={field.name}>{field.label}<input name={field.name} type={field.type ?? "text"} required /></label>)}
    <button disabled={busy} className="button dark" type="submit">{busy ? "Procesando…" : button}</button>
    {message && <p role="status" className="form-status">{message}</p>}
  </form>;
}
