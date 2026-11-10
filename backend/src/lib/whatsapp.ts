import { createHmac, timingSafeEqual } from 'node:crypto';

export interface WhatsAppConfig {
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_API_VERSION: string;
  WHATSAPP_TEMPLATE_NAME?: string;
  WHATSAPP_TEMPLATE_LANG: string;
}

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; retryable: boolean; code: string; message: string };

/** Meta error codes that are temporary (rate limits, throttling, transient server trouble). */
const RETRYABLE_CODES = new Set([1, 2, 4, 17, 32, 613, 80007, 130429, 131016, 131056, 133016]);

export function missingConfig(cfg: Pick<WhatsAppConfig, 'WHATSAPP_ACCESS_TOKEN' | 'WHATSAPP_PHONE_NUMBER_ID'>): string[] {
  const missing: string[] = [];
  if (!cfg.WHATSAPP_ACCESS_TOKEN) missing.push('WHATSAPP_ACCESS_TOKEN');
  if (!cfg.WHATSAPP_PHONE_NUMBER_ID) missing.push('WHATSAPP_PHONE_NUMBER_ID');
  return missing;
}

/** "+62 812-3456-7890" -> "6281234567890" (the Cloud API wants digits only, with country code). */
export function toWaNumber(e164: string): string {
  return e164.replace(/\D/g, '');
}

/** Template body variables may not contain newlines/tabs or runs of 4+ spaces, and are capped at 1024 characters. */
export function templateParam(text: string): string {
  const flat = text.replace(/[\r\n\t]+/g, ' | ').replace(/ {4,}/g, '   ').trim();
  return flat.length > 1024 ? `${flat.slice(0, 1021)}...` : flat;
}

export function buildPayload(cfg: Pick<WhatsAppConfig, 'WHATSAPP_TEMPLATE_NAME' | 'WHATSAPP_TEMPLATE_LANG'>, toE164: string, body: string) {
  const to = toWaNumber(toE164);
  if (cfg.WHATSAPP_TEMPLATE_NAME) {
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: cfg.WHATSAPP_TEMPLATE_NAME,
        language: { code: cfg.WHATSAPP_TEMPLATE_LANG },
        components: [{ type: 'body', parameters: [{ type: 'text', text: templateParam(body) }] }],
      },
    };
  }
  // Free-form text: Meta only delivers it if the person messaged this number in the last 24 hours.
  return { messaging_product: 'whatsapp', to, type: 'text', text: { preview_url: false, body: body.slice(0, 4096) } };
}

/** Errors where the request certainly never reached Meta, so retrying cannot create a duplicate message. */
const NEVER_SENT = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);

export async function sendWhatsApp(cfg: WhatsAppConfig, toE164: string, body: string, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const missing = missingConfig(cfg);
  if (missing.length) {
    return { ok: false, retryable: false, code: 'whatsapp_not_configured', message: `WhatsApp Cloud API is not configured. Set: ${missing.join(', ')}` };
  }
  let res: Response;
  try {
    res = await fetchImpl(`https://graph.facebook.com/${cfg.WHATSAPP_API_VERSION}/${cfg.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(cfg, toE164, body)),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const code = (err as { cause?: { code?: string } }).cause?.code ?? '';
    if (NEVER_SENT.has(code)) return { ok: false, retryable: true, code: 'network_error', message: `Could not reach WhatsApp Cloud API (${code})` };
    // Timeout or connection reset: Meta may have accepted the message. Retrying automatically could send it twice,
    // so this is not retried by the worker; check the delivery status and use "Retry failed" if it really did not arrive.
    return { ok: false, retryable: false, code: 'delivery_unknown', message: 'No response from WhatsApp Cloud API; the message may or may not have been sent. Check before retrying.' };
  }

  const json = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[]; error?: { code?: number; message?: string; error_data?: { details?: string } } };
  if (res.ok) {
    const id = json.messages?.[0]?.id;
    if (id) return { ok: true, messageId: id };
    return { ok: false, retryable: false, code: 'bad_response', message: 'WhatsApp Cloud API accepted the request but returned no message id' };
  }
  const e = json.error;
  const metaCode = e?.code ?? 0;
  let message = e?.error_data?.details ?? e?.message ?? `WhatsApp Cloud API responded ${res.status}`;
  if (metaCode === 131047 || metaCode === 131051) message += ' (outside the 24-hour window: set WHATSAPP_TEMPLATE_NAME to an approved template)';
  if (metaCode === 190) message += ' (access token invalid or expired)';
  const retryable = res.status === 429 || res.status >= 500 || RETRYABLE_CODES.has(metaCode);
  return { ok: false, retryable, code: metaCode ? `wa_${metaCode}` : `http_${res.status}`, message: message.slice(0, 500) };
}

/** Meta signs webhook bodies: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, raw body). */
export function verifySignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const given = header.slice(7);
  const a = Buffer.from(given, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
