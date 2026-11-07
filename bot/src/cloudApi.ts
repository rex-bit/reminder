import { config } from './config';

export interface SendInput {
  body: string;
  recipient: { type: 'individual' | 'group'; phone_e164: string | null; wa_group_id: string | null };
}
export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; retryable: boolean; code: string; message: string; status: number };

/** Template parameters may not contain new lines, tabs or runs of 4+ spaces (Meta rejects them), so flatten the text. */
export function sanitizeTemplateParam(text: string): string {
  return text.replace(/[\r\n\t]+/g, ' | ').replace(/ {4,}/g, '   ').trim();
}

export function buildPayload(input: SendInput): Record<string, unknown> {
  const isGroup = input.recipient.type === 'group';
  const to = isGroup ? input.recipient.wa_group_id : input.recipient.phone_e164?.replace(/^\+/, '');
  const base = { messaging_product: 'whatsapp', ...(isGroup ? { recipient_type: 'group' } : {}), to };
  if (config.WHATSAPP_TEMPLATE_NAME) {
    return {
      ...base,
      type: 'template',
      template: {
        name: config.WHATSAPP_TEMPLATE_NAME,
        language: { code: config.WHATSAPP_TEMPLATE_LANG },
        components: [{ type: 'body', parameters: [{ type: 'text', text: sanitizeTemplateParam(input.body) }] }],
      },
    };
  }
  return { ...base, type: 'text', text: { body: input.body, preview_url: false } };
}

// Error codes Meta documents as temporary (throughput/pair rate limits, transient server errors).
const RETRYABLE_CODES = new Set([1, 2, 4, 17, 341, 80007, 130429, 131048, 131056]);

export async function sendMessage(input: SendInput): Promise<SendResult> {
  if (input.recipient.type === 'group' && !config.WHATSAPP_GROUPS_ENABLED) {
    return { ok: false, retryable: false, status: 422, code: 'groups_not_enabled', message: 'Group messaging is disabled on this bot (WHATSAPP_GROUPS_ENABLED=false). Use manual sharing.' };
  }
  const to = input.recipient.type === 'group' ? input.recipient.wa_group_id : input.recipient.phone_e164;
  if (!to) return { ok: false, retryable: false, status: 422, code: 'missing_recipient', message: 'Recipient has no phone number or group id' };

  const url = `https://graph.facebook.com/${config.GRAPH_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(input)),
      signal: AbortSignal.timeout(12_000),
    });
  } catch (err) {
    return { ok: false, retryable: true, status: 503, code: 'graph_unreachable', message: err instanceof Error ? err.message : 'Cannot reach Meta' };
  }

  const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { code?: number; message?: string; error_data?: { details?: string } } };
  const id = json.messages?.[0]?.id;
  if (res.ok && id) return { ok: true, messageId: id };

  const code = json.error?.code;
  const detail = json.error?.error_data?.details ?? json.error?.message ?? `Meta responded ${res.status}`;
  const retryable = res.status === 429 || res.status >= 500 || (code !== undefined && RETRYABLE_CODES.has(code));
  return { ok: false, retryable, status: retryable ? 503 : 422, code: code !== undefined ? String(code) : `http_${res.status}`, message: detail.slice(0, 500) };
}
