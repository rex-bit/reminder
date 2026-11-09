import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, notFoundError } from '../../http/errors';
import { validate } from '../../http/validate';
import { query } from '../../db/pool';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { logActivity } from '../activity/activity.service';
import { idParams } from '../reminders/reminders.schema';

export const recipientsRouter = Router();
recipientsRouter.use(authenticate);

const body = z
  .object({
    name: z.string().trim().min(1).max(120),
    type: z.enum(['individual', 'group']),
    channel: z.enum(['whatsapp_cloud', 'manual_share']),
    phone_e164: z.string().regex(/^\+[1-9][0-9]{6,14}$/, 'Use international format, e.g. +60123456789').nullable().default(null),
    wa_group_id: z.string().trim().min(1).max(200).nullable().default(null),
    is_active: z.boolean().default(true),
    notes: z.string().max(500).default(''),
  })
  .superRefine((v, ctx) => {
    if (v.channel === 'whatsapp_cloud' && v.type === 'individual' && !v.phone_e164) ctx.addIssue({ code: 'custom', path: ['phone_e164'], message: 'Phone number is required' });
    if (v.channel === 'whatsapp_cloud' && v.type === 'group' && !v.wa_group_id) ctx.addIssue({ code: 'custom', path: ['wa_group_id'], message: 'Group ID is required' });
  });
const COLS = 'id, name, type, channel, phone_e164, wa_group_id, is_active, notes';

recipientsRouter.get('/', requirePermission('recipients.read'), asyncHandler(async (_req, res) => {
  const r = await query(`SELECT ${COLS} FROM recipients WHERE deleted_at IS NULL ORDER BY lower(name)`);
  res.json({ items: r.rows });
}));

recipientsRouter.post('/', requirePermission('recipients.manage'), validate({ body }), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof body>;
  const r = await query(
    `INSERT INTO recipients (name, type, channel, phone_e164, wa_group_id, is_active, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${COLS}`,
    [b.name, b.type, b.channel, b.phone_e164, b.wa_group_id, b.is_active, b.notes, req.admin!.id],
  );
  await logActivity({ action: 'recipient.create', entityType: 'recipient', entityId: r.rows[0]!.id, metadata: { name: b.name, channel: b.channel } }, req);
  res.status(201).json({ recipient: r.rows[0] });
}));

recipientsRouter.patch('/:id', requirePermission('recipients.manage'), validate({ params: idParams, body }), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof body>;
  const r = await query(
    `UPDATE recipients SET name=$2, type=$3, channel=$4, phone_e164=$5, wa_group_id=$6, is_active=$7, notes=$8 WHERE id=$1 AND deleted_at IS NULL RETURNING ${COLS}`,
    [req.params.id, b.name, b.type, b.channel, b.phone_e164, b.wa_group_id, b.is_active, b.notes],
  );
  if (!r.rows[0]) throw notFoundError('Recipient not found');
  await logActivity({ action: 'recipient.update', entityType: 'recipient', entityId: req.params.id }, req);
  res.json({ recipient: r.rows[0] });
}));

recipientsRouter.delete('/:id', requirePermission('recipients.manage'), validate({ params: idParams }), asyncHandler(async (req, res) => {
  const r = await query(`UPDATE recipients SET deleted_at = now(), is_active = false WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [req.params.id]);
  if (!r.rowCount) throw notFoundError('Recipient not found');
  await logActivity({ action: 'recipient.delete', entityType: 'recipient', entityId: req.params.id }, req);
  res.status(204).end();
}));
