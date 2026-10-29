export async function mutate(resource: string, method: "POST" | "PATCH" | "DELETE", payload: Record<string, unknown>, options: { timeoutMs?: number } = {}) {
  const controller = options.timeoutMs ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), options.timeoutMs) : null;
  try {
    const response = await fetch(`/api/data/${resource}`, {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      ...(controller ? { signal: controller.signal } : {}),
    });
    const body = await response.json();
    return { ok: response.ok, data: body.data, error: response.ok ? "" : body.error ?? "No se pudo completar la operación. Intentá nuevamente.", ...(controller && response.status >= 500 ? { uncertain: true } : {}) };
  } catch {
    return { ok: false, data: null, error: "No se pudo conectar. Revisá tu conexión e intentá nuevamente.", ...(controller ? { uncertain: true } : {}) };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

// Un timeout no prueba que el pago haya fallado. Consultar todos los tramos antes de reintentar.
export async function reconcilePayment(codes: string[], timeoutMs = 10000): Promise<"confirmed" | "pending" | "unknown"> {
  if (!codes.length || codes.some((code) => !code)) return "unknown";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("/api/data/reservations", { cache: "no-store", signal: controller.signal });
    if (!response.ok) return "unknown";
    const body = await response.json();
    if (!Array.isArray(body.data)) return "unknown";
    const statuses = codes.map((code) => body.data.find((row: { code: string; status: string }) => row.code === code)?.status);
    if (statuses.every((status) => status === "Confirmada")) return "confirmed";
    if (statuses.every((status) => status === "Pendiente de pago")) return "pending";
    return "unknown";
  } catch { return "unknown"; }
  finally { clearTimeout(timeout); }
}
