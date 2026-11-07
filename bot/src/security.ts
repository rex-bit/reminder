import { createHmac, timingSafeEqual } from 'node:crypto';

/** Constant-time string comparison that does not leak length through an exception. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Meta signs the RAW request body: header `X-Hub-Signature-256: sha256=<hex HMAC-SHA256 with the app secret>`. */
export function verifySignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return safeEqual(header.slice(7), expected);
}
