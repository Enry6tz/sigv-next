import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type OutboxItem = { id: string; claimToken: string; payload: unknown; attempts: number };
export type OutboxStore = {
  claim(limit: number): Promise<OutboxItem[]>;
  finish(id: string, token: string, sent: boolean, error: string | null): Promise<void>;
};

export function processorSecretMatches(expected: string | undefined, authorization: string | null) {
  if (!expected || !authorization?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice(7));
  const secret = Buffer.from(expected);
  return supplied.length === secret.length && timingSafeEqual(supplied, secret);
}

export async function processMailOutbox(store: OutboxStore, deliver: (item: OutboxItem) => Promise<boolean>, limit = 5) {
  const items = await store.claim(Math.min(5, Math.max(1, limit)));
  const result = { claimed: items.length, sent: 0, retry: 0 };
  for (const item of items) {
    let sent = false;
    try { sent = await deliver(item); } catch { /* El error SMTP no expone configuración ni detiene otros envíos. */ }
    await store.finish(item.id, item.claimToken, sent, sent ? null : "No se pudo entregar el correo. Se reintentará automáticamente.");
    if (sent) result.sent++; else result.retry++;
  }
  return result;
}

export function supabaseOutboxStore(client: SupabaseClient): OutboxStore {
  return {
    async claim(limit) {
      const { data, error } = await client.rpc("sigv_claim_flight_mail", { p_limit: limit });
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.id), claimToken: String(row.claim_token), payload: row.payload, attempts: Number(row.attempts),
      }));
    },
    async finish(id, token, sent, errorMessage) {
      const { error } = await client.rpc("sigv_finish_flight_mail", { p_id: id, p_token: token, p_sent: sent, p_error: errorMessage });
      if (error) throw error;
    },
  };
}
