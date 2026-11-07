import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env';
import { query } from '../../db/pool';
import { AppError, asyncHandler } from '../../http/errors';
import { validate } from '../../http/validate';
import { pushEnabled } from '../push/push.service';
import { appTimezone, isPublicEnabled } from './public.service';

/**
 * Read-only class page. No login. Only fields meant for students are returned:
 * no recipients, no phone numbers, no delivery logs, no admin names.
 * Only reminders already marked as sent are visible (never drafts, scheduled, waiting-to-send, failed or cancelled).
 * Everything is off until the Owner turns on the `public.enabled` setting.
 */
export const publicRouter = Router();

const limiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'rate_limited', message: 'Too many requests, please try again later' } } });
const subscribeLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'rate_limited', message: 'Too many requests, please try again later' } } });
const MAX_PUBLIC_SUBSCRIPTIONS = 5000;

const enabledOnly: RequestHandler = asyncHandler(async (_req, _res, next) => {
  if (!(await isPublicEnabled())) throw new AppError(404, 'public_disabled', 'The public page is not enabled');
  next();
});

publicRouter.use(limiter, enabledOnly);

const COLS = `id, title, kind, status, reminder_date, content, custom_message, scheduled_at, sent_at, timezone`;

publicRouter.get('/feed', asyncHandler(async (_req, res) => {
  const tz = await appTimezone();
  const upcoming = await query(
    `SELECT ${COLS} FROM reminders
      WHERE deleted_at IS NULL AND status = 'sent'
        AND reminder_date BETWEEN (now() AT TIME ZONE $1)::date AND (now() AT TIME ZONE $1)::date + 7
      ORDER BY reminder_date, scheduled_at NULLS LAST, created_at`,
    [tz],
  );
  const recent = await query(
    `SELECT ${COLS} FROM reminders
      WHERE deleted_at IS NULL AND status = 'sent'
        AND reminder_date < (now() AT TIME ZONE $1)::date AND reminder_date >= (now() AT TIME ZONE $1)::date - 14
      ORDER BY reminder_date DESC, sent_at DESC NULLS LAST LIMIT 20`,
    [tz],
  );
  // Emergency notices stay pinned for 3 days after they were released.
  const pinned = await query(
    `SELECT ${COLS} FROM reminders
      WHERE deleted_at IS NULL AND kind = 'emergency' AND status = 'sent'
        AND COALESCE(sent_at, created_at) > now() - interval '3 days'
      ORDER BY COALESCE(sent_at, created_at) DESC LIMIT 5`,
  );
  res.json({ timezone: tz, today: new Date().toISOString(), pinned: pinned.rows, upcoming: upcoming.rows, recent: recent.rows });
}));

publicRouter.get('/push/config', (_req, res) => {
  res.json({ enabled: pushEnabled, publicKey: pushEnabled ? env.VAPID_PUBLIC_KEY : null });
});

const subBody = z.object({
  endpoint: z.string().url().max(2000).refine((u) => u.startsWith('https://'), 'Push endpoints must be https'),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

publicRouter.post('/push/subscribe', subscribeLimiter, validate({ body: subBody }), asyncHandler(async (req, res) => {
  if (!pushEnabled) throw new AppError(503, 'push_disabled', 'Push notifications are not configured on the server');
  const b = req.body as z.infer<typeof subBody>;
  const count = await query<{ n: number }>(`SELECT count(*)::int AS n FROM public_push_subscriptions`);
  if ((count.rows[0]?.n ?? 0) >= MAX_PUBLIC_SUBSCRIPTIONS) throw new AppError(503, 'too_many_subscriptions', 'Notification list is full');
  await query(
    `INSERT INTO public_push_subscriptions (endpoint, p256dh, auth, user_agent) VALUES ($1,$2,$3,$4)
     ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, last_error = NULL`,
    [b.endpoint, b.keys.p256dh, b.keys.auth, req.get('user-agent')?.slice(0, 300) ?? null],
  );
  res.status(204).end();
}));

publicRouter.post('/push/unsubscribe', subscribeLimiter, validate({ body: z.object({ endpoint: z.string().url().max(2000) }) }), asyncHandler(async (req, res) => {
  await query(`DELETE FROM public_push_subscriptions WHERE endpoint = $1`, [req.body.endpoint]);
  res.status(204).end();
}));
