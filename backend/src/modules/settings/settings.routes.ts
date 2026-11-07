import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/errors';
import { validate } from '../../http/validate';
import { query, withTx } from '../../db/pool';
import { isValidTimezone } from '../../lib/time';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { logActivity } from '../activity/activity.service';

export const settingsRouter = Router();
settingsRouter.use(authenticate);

// Only these keys can be changed through the API.
const body = z
  .object({
    'app.name': z.string().trim().min(1).max(60),
    'app.timezone': z.string().refine(isValidTimezone, 'Invalid IANA timezone'),
    'reminder.default_send_time': z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm'),
    'whatsapp.groups_supported': z.boolean(),
    'public.enabled': z.boolean(),
  })
  .partial()
  .strict();

async function readAll() {
  const r = await query<{ key: string; value: unknown }>(`SELECT key, value FROM app_settings WHERE key = ANY($1::text[])`, [Object.keys(body.shape)]);
  return Object.fromEntries(r.rows.map((x) => [x.key, x.value]));
}

settingsRouter.get('/', requirePermission('settings.read'), asyncHandler(async (_req, res) => {
  res.json({ settings: await readAll() });
}));

settingsRouter.put('/', requirePermission('settings.update'), validate({ body }), asyncHandler(async (req, res) => {
  const changes = req.body as Record<string, unknown>;
  await withTx(async (db) => {
    for (const [key, value] of Object.entries(changes)) {
      await query(
        `INSERT INTO app_settings (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by`,
        [key, JSON.stringify(value), req.admin!.id],
        db,
      );
    }
    await logActivity({ action: 'settings.update', entityType: 'settings', metadata: { keys: Object.keys(changes) } }, req, db);
  });
  res.json({ settings: await readAll() });
}));
