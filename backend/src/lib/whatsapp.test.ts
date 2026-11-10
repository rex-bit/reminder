import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { buildPayload, missingConfig, parseStatuses, sendWhatsApp, templateParam, toWaNumber, verifySignature, type WhatsAppConfig } from './whatsapp';

const cfg: WhatsAppConfig = { WHATSAPP_ACCESS_TOKEN: 'tok', WHATSAPP_PHONE_NUMBER_ID: '123', WHATSAPP_API_VERSION: 'v23.0', WHATSAPP_TEMPLATE_LANG: 'id' };
const resp = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('whatsapp client', () => {
  it('reports missing credentials instead of pretending to send', async () => {
    expect(missingConfig({})).toEqual(['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID']);
    const f = vi.fn();
    const r = await sendWhatsApp({ ...cfg, WHATSAPP_ACCESS_TOKEN: undefined }, '+62812', 'hi', f as never);
    expect(r).toMatchObject({ ok: false, code: 'whatsapp_not_configured', retryable: false });
    expect(f).not.toHaveBeenCalled();
  });

  it('formats numbers and template parameters', () => {
    expect(toWaNumber('+62 812-3456-7890')).toBe('6281234567890');
    expect(templateParam('a\nb\n\nc')).toBe('a | b | c');
    expect(templateParam('x'.repeat(2000))).toHaveLength(1024);
    expect(buildPayload({ WHATSAPP_TEMPLATE_LANG: 'id' }, '+62812', 'hi')).toMatchObject({ type: 'text' });
    expect(buildPayload({ WHATSAPP_TEMPLATE_NAME: 'reminder', WHATSAPP_TEMPLATE_LANG: 'id' }, '+62812', 'hi')).toMatchObject({ type: 'template', template: { name: 'reminder' } });
  });

  it('returns the message id on success', async () => {
    const f = vi.fn(() => resp(200, { messages: [{ id: 'wamid.1' }] }));
    expect(await sendWhatsApp(cfg, '+62812', 'hi', f as never)).toEqual({ ok: true, messageId: 'wamid.1' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v23.0/123/messages');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('classifies errors', async () => {
    expect(await sendWhatsApp(cfg, '+62812', 'hi', (() => resp(429, { error: { code: 130429, message: 'rate' } })) as never)).toMatchObject({ ok: false, retryable: true });
    expect(await sendWhatsApp(cfg, '+62812', 'hi', (() => resp(400, { error: { code: 131047, message: 'window' } })) as never)).toMatchObject({ ok: false, retryable: false, code: 'wa_131047' });
    expect(await sendWhatsApp(cfg, '+62812', 'hi', (() => resp(500, {})) as never)).toMatchObject({ ok: false, retryable: true });
  });

  it('never auto-retries when the request may have reached Meta (no duplicate messages)', async () => {
    const timeout = () => Promise.reject(Object.assign(new Error('timeout'), { cause: { code: 'UND_ERR_HEADERS_TIMEOUT' } }));
    expect(await sendWhatsApp(cfg, '+62812', 'hi', timeout as never)).toMatchObject({ ok: false, retryable: false, code: 'delivery_unknown' });
    const refused = () => Promise.reject(Object.assign(new Error('x'), { cause: { code: 'ECONNREFUSED' } }));
    expect(await sendWhatsApp(cfg, '+62812', 'hi', refused as never)).toMatchObject({ ok: false, retryable: true, code: 'network_error' });
  });
});

describe('webhook', () => {
  it('verifies signatures', () => {
    const raw = Buffer.from('{"a":1}');
    const sig = 'sha256=' + createHmac('sha256', 'secret').update(raw).digest('hex');
    expect(verifySignature(raw, sig, 'secret')).toBe(true);
    expect(verifySignature(raw, sig, 'other')).toBe(false);
    expect(verifySignature(raw, undefined, 'secret')).toBe(false);
    expect(verifySignature(raw, 'sha256=zz', 'secret')).toBe(false);
  });

  it('parses Meta status events', () => {
    const ev = parseStatuses({ entry: [{ changes: [{ value: { statuses: [
      { id: 'wamid.1', status: 'delivered', timestamp: '1700000000' },
      { id: 'wamid.2', status: 'failed', timestamp: '1700000001', errors: [{ code: 131026, title: 'Undeliverable' }] },
      { id: 'wamid.3', status: 'deleted' },
    ] } }] }] });
    expect(ev).toHaveLength(2);
    expect(ev[1]).toMatchObject({ waMessageId: 'wamid.2', status: 'failed', errorCode: '131026', errorMessage: 'Undeliverable' });
    expect(parseStatuses({})).toEqual([]);
  });
});
