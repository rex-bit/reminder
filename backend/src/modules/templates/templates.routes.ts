import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, notFoundError } from '../../http/errors';
import { validate } from '../../http/validate';
import { query } from '../../db/pool';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { logActivity } from '../activity/activity.service';
import { contentSchema, idParams } from '../reminders/reminders.schema';

export const templatesRouter = Router();
templatesRouter.use(authenticate);

const body = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(''),
  content: contentSchema.default({}),
  message_body: z.string().max(4000).nullable().default(null),
});
const COLS = 'id, name, description, content, message_body, created_at, updated_at';

templatesRouter.get('/', requirePermission('templates.read'), asyncHandler(async (_req, res) => {
  const r = await query(`SELECT ${COLS} FROM reminder_templates WHERE deleted_at IS NULL ORDER BY lower(name)`);
  res.json({ items: r.rows });
}));

templatesRouter.post('/', requirePermission('templates.manage'), validate({ body }), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof body>;
  const r = await query(
    `INSERT INTO reminder_templates (name, description, content, message_body, created_by) VALUES ($1, $2, $3::jsonb, $4, $5) RETURNING ${COLS}`,
    [b.name, b.description, JSON.stringify(b.content), b.message_body, req.admin!.id],
  );
  await logActivity({ action: 'template.create', entityType: 'template', entityId: r.rows[0]!.id, metadata: { name: b.name } }, req);
  res.status(201).json({ template: r.rows[0] });
}));

templatesRouter.patch('/:id', requirePermission('templates.manage'), validate({ params: idParams, body }), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof body>;
  const r = await query(
    `UPDATE reminder_templates SET name = $2, description = $3, content = $4::jsonb, message_body = $5 WHERE id = $1 AND deleted_at IS NULL RETURNING ${COLS}`,
    [req.params.id, b.name, b.description, JSON.stringify(b.content), b.message_body],
  );
  if (!r.rows[0]) throw notFoundError('Template not found');
  await logActivity({ action: 'template.update', entityType: 'template', entityId: req.params.id }, req);
  res.json({ template: r.rows[0] });
}));

templatesRouter.delete('/:id', requirePermission('templates.manage'), validate({ params: idParams }), asyncHandler(async (req, res) => {
  const r = await query(`UPDATE reminder_templates SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [req.params.id]);
  if (!r.rowCount) throw notFoundError('Template not found');
  await logActivity({ action: 'template.delete', entityType: 'template', entityId: req.params.id }, req);
  res.status(204).end();
}));
