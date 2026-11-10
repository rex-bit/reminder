import { env } from '../../config/env';
import { sendWhatsApp } from '../../lib/whatsapp';

export interface DispatchInput {
  deliveryId: string;
  body: string;
  recipient: { type: 'individual' | 'group'; phone_e164: string | null; wa_group_id: string | null };
}

export type DispatchResult =
  | { ok: true; messageId: string | null }
  | { ok: false; retryable: boolean; code: string; message: string };

/**
 * Sends one message through the official WhatsApp Business Cloud API.
 * Nothing is simulated: without credentials the delivery fails and says which variables are missing.
 * Duplicate protection lives in the worker (a delivery is only sent while it is `queued`, and ambiguous network failures are never auto-retried).
 */
export async function dispatch(input: DispatchInput): Promise<DispatchResult> {
  if (input.recipient.type !== 'individual' || !input.recipient.phone_e164) {
    return { ok: false, retryable: false, code: 'unsupported_recipient', message: 'WhatsApp automatic send needs a recipient with a phone number' };
  }
  return sendWhatsApp(env, input.recipient.phone_e164, input.body);
}
