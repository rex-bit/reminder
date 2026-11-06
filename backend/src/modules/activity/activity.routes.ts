import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool';
import { asyncHandler } from '../../http/errors';
import { validate } from '../../http/validate';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';

export const activityRouter = Router();

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  action: z.string().max(80).optional(),
  adminId: z.string().uuid().optional(),
});

activityRouter.get(
  '/',
  authenticate,
  requirePermission('logs.activity'),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.action) {
      params.push(`${q.action}%`);
      where.push(`l.action LIKE $${params.length}`);
    }
    if (q.adminId) {
      params.push(q.adminId);
      where.push(`l.admin_id = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total = await query<{ count: string }>(`SELECT count(*) FROM activity_logs l ${whereSql}`, params);
    params.push(q.pageSize, (q.page - 1) * q.pageSize);
    const rows = await query(
      `SELECT l.id, l.action, l.entity_type, l.entity_id, l.metadata, l.ip, l.created_at,
              a.id AS admin_id, a.admin_code, a.display_name AS admin_name
         FROM activity_logs l LEFT JOIN admins a ON a.id = l.admin_id
         ${whereSql}
         ORDER BY l.created_at DESC, l.id DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    res.json({ items: rows.rows, page: q.page, pageSize: q.pageSize, total: Number(total.rows[0]?.count ?? 0) });
  }),
);
