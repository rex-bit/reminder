import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { safeEqual, verifySignature } from './security';
import { extractStatuses } from './webhook';

describe('webhook signature', () => {
  const body = Buffer.from('{"object":"whatsapp_business_account"}');
  const good = 'sha256=' + createHmac('sha256', 'secret').update(body).digest('hex');
  it('accepts a valid signature', () => expect(verifySignature(body, good, 'secret')).toBe(true));
  it('rejects wrong secret, missing header, tampered body', () => {
    expect(verifySignature(body, good, 'other')).toBe(false);
    expect(verifySignature(body, undefined, 'secret')).toBe(false);
    expect(verifySignature(Buffer.from('{}'), good, 'secret')).toBe(false);
  });
  it('safeEqual handles different lengths', () => expect(safeEqual('a', 'ab')).toBe(false));
});

describe('extractStatuses', () => {
  it('maps status events and ignores inbound messages', () => {
    const out = extractStatuses({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ field: 'messages', value: { statuses: [
        { id: 'wamid.1', status: 'delivered', timestamp: '1762600000', recipient_id: '60123' },
        { id: 'wamid.2', status: 'failed', timestamp: '1762600001', errors: [{ code: 131047, title: 'Re-engagement message', error_data: { details: 'More than 24 hours' } }] },
        { id: 'wamid.3', status: 'weird' },
      ] } }] }],
    });
    expect(out.map((s) => s.status)).toEqual(['delivered', 'failed']);
    expect(out[1]?.errorCode).toBe('131047');
  });
});
