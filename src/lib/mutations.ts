export async function mutate(resource: string, method: "POST" | "PATCH" | "DELETE", payload: Record<string, unknown>) {
  try {
    const response = await fetch(`/api/data/${resource}`, {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const body = await response.json();
    return { ok: response.ok, data: body.data, error: response.ok ? "" : body.error ?? "No se pudo completar la operación. Intentá nuevamente." };
  } catch {
    return { ok: false, data: null, error: "No se pudo conectar. Revisá tu conexión e intentá nuevamente." };
  }
}
