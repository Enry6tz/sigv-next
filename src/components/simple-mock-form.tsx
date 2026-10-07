"use client";

import { useState, type FormEvent } from "react";
import { ActionNotice, type Notice } from "./action-notice";

type Field = { name: string; label: string; type?: string };

export function SimpleMockForm({ resource, fields, button, live = false, onSuccess }: { resource: string; fields: Field[]; button: string; live?: boolean; onSuccess?: () => void }) {
  const [message, setMessage] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/data/${resource}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
      const result = await response.json();
      setMessage({ ok: response.ok, text: response.ok ? live ? "Cambios guardados correctamente." : "Simulación completada. No se guardaron datos." : result.error ?? "No se pudo procesar la solicitud." });
      if (response.ok) onSuccess?.();
    } catch {
      setMessage({ ok: false, text: "No se pudo conectar. Revisá tu conexión e intentá nuevamente." });
    } finally {
      setBusy(false);
    }
  }

  return <form className="stack-form" onSubmit={submit}>
    {fields.map((field) => <label key={field.name}>{field.label}<input name={field.name} type={field.type ?? "text"} required /></label>)}
    <button disabled={busy} className="button dark" type="submit">{busy ? "Procesando…" : button}</button>
    <ActionNotice notice={message} />
  </form>;
}
