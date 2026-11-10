import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/errors';
import { validate } from '../../http/validate';
import { query } from '../../db/pool';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { env } from '../../config/env';
import { missingConfig } from '../../lib/whatsapp';
import { pushEnabled } from '../push/push.service';

export const deliveriesRouter = Router();

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['queued', 'accepted', 'sent', 'delivered', 'read', 'failed']).optional(),
  reminderId: z.string().uuid().optional(),
});

/** Which delivery methods are actually usable right now (the form uses this to explain missing configuration). */
deliveriesRouter.get('/config', authenticate, requirePermission('reminders.read'), (_req, res) => {
  const missing = missingConfig(env);
  res.json({
    whatsapp: {
      configured: missing.length === 0,
      missing,
      template: Boolean(env.WHATSAPP_TEMPLATE_NAME),
      webhook: Boolean(env.WHATSAPP_VERIFY_TOKEN && env.WHATSAPP_APP_SECRET),
    },
    push: { configured: pushEnabled },
  });
});

deliveriesRouter.get('/', authenticate, requirePermission('logs.delivery'), validate({ query: listQuery }), asyncHandler(async (req, res) => {
  const q = req.query as unknown as z.infer<typeof listQuery>;
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.status) { params.push(q.status); where.push(`d.status = $${params.length}::delivery_status`); }
  if (q.reminderId) { params.push(q.reminderId); where.push(`d.reminder_id = $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await query<{ n: number }>(`SELECT count(*)::int AS n FROM delivery_logs d ${whereSql}`, params);
  params.push(q.pageSize, (q.page - 1) * q.pageSize);
  const rows = await query(
    `SELECT d.id, d.reminder_id, r.title AS reminder_title, d.recipient_id, rc.name AS recipient_name, d.channel, d.status, d.wa_message_id,
            d.attempt, d.error_code, d.error_message, d.sent_at, d.delivered_at, d.read_at, d.created_at
       FROM delivery_logs d JOIN reminders r ON r.id = d.reminder_id LEFT JOIN recipients rc ON rc.id = d.recipient_id
       ${whereSql} ORDER BY d.created_at DESC, d.id LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  res.json({ items: rows.rows, page: q.page, pageSize: q.pageSize, total: total.rows[0]?.n ?? 0 });
}));
