import { env } from '../../config/env';

export interface DispatchInput {
  deliveryId: string;
  idempotencyKey: string;
  body: string;
  recipient: { type: 'individual' | 'group'; phone_e164: string | null; wa_group_id: string | null };
}

export type DispatchResult =
  | { ok: true; messageId: string | null }
  | { ok: false; retryable: boolean; code: string; message: string };

/**
 * Hands a message to the WhatsApp bot service (Phase 4), which talks to the Cloud API.
 * Nothing is simulated: with no bot configured the delivery fails and says so.
 * The idempotency key lets the bot drop a duplicate if a response was lost and we retry.
 */
export async function dispatch(input: DispatchInput): Promise<DispatchResult> {
  if (!env.BOT_SERVICE_URL || !env.BOT_API_KEY) {
    return { ok: false, retryable: false, code: 'bot_not_configured', message: 'BOT_SERVICE_URL / BOT_API_KEY are not set; the WhatsApp bot service is not connected' };
  }
  let res: Response;
  try {
    res = await fetch(`${env.BOT_SERVICE_URL.replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': env.BOT_API_KEY, 'Idempotency-Key': input.idempotencyKey },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    return { ok: false, retryable: true, code: 'bot_unreachable', message: err instanceof Error ? err.message : 'Bot service unreachable' };
  }

  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as { messageId?: string };
    return { ok: true, messageId: body.messageId ?? null };
  }
  const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
  // 429 and 5xx are transient; other 4xx (bad number, template required, ...) will not succeed on retry.
  const retryable = res.status === 429 || res.status >= 500;
  return { ok: false, retryable, code: body.error?.code ?? `http_${res.status}`, message: body.error?.message ?? `Bot service responded ${res.status}` };
}
