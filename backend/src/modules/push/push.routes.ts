import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { AppError, asyncHandler } from '../../http/errors';
import { validate } from '../../http/validate';
import { query } from '../../db/pool';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { notifyOne, pushEnabled } from './push.service';

export const pushRouter = Router();
pushRouter.use(authenticate);

const subBody = z.object({
  endpoint: z.string().url().max(2000).refine((u) => u.startsWith('https://'), 'Push endpoints must be https'),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

pushRouter.get('/config', requirePermission('reminders.read'), asyncHandler(async (req, res) => {
  const mine = await query<{ n: number }>(`SELECT count(*)::int AS n FROM push_subscriptions WHERE admin_id = $1`, [req.admin!.id]);
  res.json({ enabled: pushEnabled, publicKey: pushEnabled ? env.VAPID_PUBLIC_KEY : null, devices: mine.rows[0]?.n ?? 0 });
}));

pushRouter.post('/subscribe', requirePermission('reminders.read'), validate({ body: subBody }), asyncHandler(async (req, res) => {
  if (!pushEnabled) throw new AppError(503, 'push_disabled', 'Push notifications are not configured on the server (VAPID keys missing)');
  const b = req.body as z.infer<typeof subBody>;
  // Re-subscribing the same browser as a different admin moves it to the current admin.
  await query(
    `INSERT INTO push_subscriptions (admin_id, endpoint, p256dh, auth, user_agent) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (endpoint) DO UPDATE SET admin_id = EXCLUDED.admin_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent, last_error = NULL`,
    [req.admin!.id, b.endpoint, b.keys.p256dh, b.keys.auth, req.get('user-agent')?.slice(0, 300) ?? null],
  );
  await query(`DELETE FROM public_push_subscriptions WHERE endpoint = $1`, [b.endpoint]);
  res.status(204).end();
}));

pushRouter.post('/unsubscribe', requirePermission('reminders.read'), validate({ body: z.object({ endpoint: z.string().url() }) }), asyncHandler(async (req, res) => {
  await query(`DELETE FROM push_subscriptions WHERE endpoint = $1 AND admin_id = $2`, [req.body.endpoint, req.admin!.id]);
  res.status(204).end();
}));

pushRouter.post('/test', requirePermission('reminders.read'), asyncHandler(async (req, res) => {
  if (!pushEnabled) throw new AppError(503, 'push_disabled', 'Push notifications are not configured on the server (VAPID keys missing)');
  const sent = await notifyOne(req.admin!.id, { title: 'Test notification', body: 'Notifications work on this device.', tag: 'test' });
  if (sent === 0) throw new AppError(409, 'no_device', 'No device accepted the notification. Enable notifications on this device first.');
  res.json({ sent });
}));
