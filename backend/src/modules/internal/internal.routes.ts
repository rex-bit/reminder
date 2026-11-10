import { timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { AppError, asyncHandler, unauthorized } from '../../http/errors';
import { validate } from '../../http/validate';
import { applyStatuses } from '../deliveries/status.service';

/** Server-to-server endpoints for the WhatsApp bot. Authenticated with BOT_API_KEY, never with admin tokens. */
export const internalRouter = Router();

const requireBotKey: RequestHandler = (req, _res, next) => {
  const expected = env.BOT_API_KEY;
  const given = req.get('x-api-key') ?? '';
  if (!expected) return next(new AppError(503, 'bot_not_configured', 'BOT_API_KEY is not configured'));
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return next(unauthorized('Invalid API key'));
  next();
};

const body = z.object({
  statuses: z
    .array(
      z.object({
        waMessageId: z.string().min(1).max(200),
        status: z.enum(['sent', 'delivered', 'read', 'failed']),
        timestamp: z.string().datetime(),
        errorCode: z.string().max(40).optional(),
        errorMessage: z.string().max(500).optional(),
      }),
    )
    .max(200),
});

internalRouter.post(
  '/whatsapp/statuses',
  requireBotKey,
  validate({ body }),
  asyncHandler(async (req, res) => {
    const { statuses } = req.body as z.infer<typeof body>;
    res.json({ received: statuses.length, applied: await applyStatuses(statuses) });
  }),
);
