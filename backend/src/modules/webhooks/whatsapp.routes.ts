import { timingSafeEqual } from 'node:crypto';
import express, { Router } from 'express';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { asyncHandler } from '../../http/errors';
import { parseStatuses, verifySignature } from '../../lib/whatsapp';
import { applyStatuses } from '../deliveries/status.service';

/** Meta webhook. Mounted BEFORE express.json because the signature is computed over the raw bytes. */
export const whatsappWebhook = Router();

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// One-time verification when you press "Verify and save" in the Meta dashboard.
whatsappWebhook.get('/', (req, res) => {
  const token = env.WHATSAPP_VERIFY_TOKEN;
  const given = String(req.query['hub.verify_token'] ?? '');
  if (token && req.query['hub.mode'] === 'subscribe' && safeEqual(given, token)) {
    res.status(200).type('text/plain').send(String(req.query['hub.challenge'] ?? ''));
    return;
  }
  res.sendStatus(403);
});

whatsappWebhook.post(
  '/',
  express.raw({ type: '*/*', limit: '1mb' }),
  asyncHandler(async (req, res) => {
    const secret = env.WHATSAPP_APP_SECRET;
    const raw = req.body as Buffer;
    if (!secret || !Buffer.isBuffer(raw) || !verifySignature(raw, req.get('x-hub-signature-256'), secret)) {
      res.sendStatus(401);
      return;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      res.sendStatus(400);
      return;
    }
    const events = parseStatuses(payload);
    const applied = events.length ? await applyStatuses(events) : 0;
    logger.info({ received: events.length, applied }, 'whatsapp webhook');
    res.sendStatus(200); // Meta retries on anything but 2xx
  }),
);
