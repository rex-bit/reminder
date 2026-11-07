import express from 'express';
import pino from 'pino';
import { z } from 'zod';
import { forwardStatuses } from './backend';
import { sendMessage } from './cloudApi';
import { config } from './config';
import { idempotency } from './idempotency';
import { safeEqual, verifySignature } from './security';
import { extractStatuses } from './webhook';

const logger = pino({ level: config.LOG_LEVEL, redact: ['req.headers.authorization', 'req.headers["x-api-key"]'] });
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.TRUST_PROXY);

app.get('/healthz', (_req, res) => res.json({ status: 'ok', groups: config.WHATSAPP_GROUPS_ENABLED, mode: config.WHATSAPP_TEMPLATE_NAME ? 'template' : 'text' }));

// ---- Webhook (called by Meta). Raw body is required to verify the signature. ----
app.get('/webhook', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query as Record<string, string | undefined>;
  if (mode === 'subscribe' && token && challenge && safeEqual(token, config.WHATSAPP_VERIFY_TOKEN)) return void res.status(200).type('text/plain').send(challenge);
  res.sendStatus(403);
});

app.post('/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const raw = req.body as Buffer;
  if (!Buffer.isBuffer(raw) || !verifySignature(raw, req.get('x-hub-signature-256'), config.WHATSAPP_APP_SECRET)) {
    logger.warn({ ip: req.ip }, 'webhook rejected: bad signature');
    return void res.sendStatus(401);
  }
  try {
    const statuses = extractStatuses(JSON.parse(raw.toString('utf8')));
    await forwardStatuses(statuses);
    res.sendStatus(200);
  } catch (err) {
    // Non-200 makes Meta retry the delivery later (it retries with backoff), so no status is lost while the backend is down.
    logger.error({ err }, 'webhook processing failed');
    res.sendStatus(500);
  }
});

// ---- Send API (called by the backend only) ----
const sendBody = z.object({
  deliveryId: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(300),
  body: z.string().min(1).max(4096),
  recipient: z.object({ type: z.enum(['individual', 'group']), phone_e164: z.string().nullable(), wa_group_id: z.string().nullable() }),
});

app.post('/v1/messages', express.json({ limit: '64kb' }), async (req, res) => {
  const key = req.get('x-api-key');
  if (!key || !safeEqual(key, config.BOT_API_KEY)) return void res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid API key' } });

  const parsed = sendBody.safeParse(req.body);
  if (!parsed.success) return void res.status(422).json({ error: { code: 'validation_error', message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') } });
  const b = parsed.data;

  const claim = await idempotency.claim(b.idempotencyKey);
  if (claim !== 'new') {
    if (claim === 'pending') return void res.status(409).json({ error: { code: 'in_progress', message: 'This message is already being sent' } });
    return void res.status(200).json({ messageId: claim.messageId, duplicate: true });
  }

  const result = await sendMessage({ body: b.body, recipient: b.recipient });
  if (result.ok) {
    await idempotency.complete(b.idempotencyKey, result.messageId);
    logger.info({ deliveryId: b.deliveryId, messageId: result.messageId }, 'message accepted by WhatsApp');
    return void res.status(202).json({ messageId: result.messageId });
  }
  await idempotency.release(b.idempotencyKey); // nothing was sent, so a retry may try again
  logger.warn({ deliveryId: b.deliveryId, code: result.code, retryable: result.retryable }, 'send failed');
  res.status(result.status).json({ error: { code: result.code, message: result.message } });
});

app.use((_req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Not found' } }));

const server = app.listen(config.PORT, () => logger.info({ port: config.PORT }, 'bot listening'));
for (const sig of ['SIGTERM', 'SIGINT'] as const) process.on(sig, () => server.close(() => process.exit(0)));
