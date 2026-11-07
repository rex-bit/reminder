import { Router, type Request } from 'express';
import type { z } from 'zod';
import { AppError, asyncHandler, badRequest, conflict, notFoundError } from '../../http/errors';
import { validate } from '../../http/validate';
import { Db, query, withTx } from '../../db/pool';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { logActivity } from '../activity/activity.service';
import { cancelOpenJobs, planJob, publishPlan, type Plan } from '../scheduler/schedule';
import { idParams, listQuery, reminderInput, scheduleBody, type ReminderInput } from './reminders.schema';

export const remindersRouter = Router();
remindersRouter.use(authenticate);

const SELECT = `SELECT r.id, r.title, r.kind, r.status, r.reminder_date, r.content, r.custom_message, r.template_id, r.timezone,
  r.scheduled_at, r.recurrence, r.recurrence_until, r.sent_at, r.created_at, r.updated_at,
  COALESCE(ARRAY(SELECT rr.recipient_id FROM reminder_recipients rr WHERE rr.reminder_id = r.id), '{}') AS recipient_ids
  FROM reminders r`;

async function load(id: string, db?: Db) {
  const res = await query(`${SELECT} WHERE r.id = $1 AND r.deleted_at IS NULL`, [id], db);
  if (!res.rows[0]) throw notFoundError('Reminder not found');
  return res.rows[0] as { id: string; status: string; title: string; recipient_ids: string[]; scheduled_at: Date | null };
}

async function setRecipients(db: Db, reminderId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length) {
    const ok = await query(`SELECT count(*)::int AS n FROM recipients WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`, [unique], db);
    if ((ok.rows[0] as { n: number }).n !== unique.length) throw badRequest('One or more recipients do not exist');
  }
  await query(`DELETE FROM reminder_recipients WHERE reminder_id = $1`, [reminderId], db);
  if (unique.length) {
    await query(`INSERT INTO reminder_recipients (reminder_id, recipient_id) SELECT $1, unnest($2::uuid[])`, [reminderId, unique], db);
  }
}

/** Scheduling needs at least one active recipient that the Cloud API can reach; manual-share recipients are sent by an admin. */
async function requireAutomaticRecipients(db: Db, reminderId: string) {
  const res = await query(
    `SELECT count(*)::int AS n FROM reminder_recipients rr JOIN recipients r ON r.id = rr.recipient_id
      WHERE rr.reminder_id = $1 AND r.is_active AND r.deleted_at IS NULL AND r.channel = 'whatsapp_cloud'`,
    [reminderId],
    db,
  );
  if ((res.rows[0] as { n: number }).n === 0) {
    throw new AppError(422, 'no_automatic_recipients', 'Add at least one active WhatsApp Cloud API recipient. Manual-share recipients are sent by an admin and cannot be scheduled.');
  }
}

const EDITABLE = ['draft', 'pending', 'failed'];

remindersRouter.get(
  '/stats',
  requirePermission('reminders.read'),
  asyncHandler(async (_req, res) => {
    const counts = await query<{ status: string; n: number }>(`SELECT status, count(*)::int AS n FROM reminders WHERE deleted_at IS NULL GROUP BY status`);
    const base: Record<string, number> = { draft: 0, pending: 0, sent: 0, failed: 0, cancelled: 0 };
    for (const r of counts.rows) base[r.status] = r.n;
    const next = await query(`${SELECT} WHERE r.deleted_at IS NULL AND r.status = 'pending' ORDER BY r.scheduled_at ASC LIMIT 5`);
    const recent = await query(`${SELECT} WHERE r.deleted_at IS NULL AND r.status IN ('sent','failed','cancelled') ORDER BY r.updated_at DESC LIMIT 5`);
    res.json({ counts: base, next: next.rows, recent: recent.rows });
  }),
);

remindersRouter.get(
  '/',
  requirePermission('reminders.read'),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    const where = ['r.deleted_at IS NULL'];
    const params: unknown[] = [];
    if (q.q) {
      params.push(`%${q.q.replace(/[\\%_]/g, '\\$&')}%`);
      where.push(`r.title ILIKE $${params.length}`);
    }
    if (q.status) {
      params.push(q.status.split(','));
      where.push(`r.status = ANY($${params.length}::reminder_status[])`);
    }
    if (q.kind) {
      params.push(q.kind);
      where.push(`r.kind = $${params.length}::reminder_kind`);
    }
    const whereSql = where.join(' AND ');
    const dir = q.sort.startsWith('-') ? 'DESC' : 'ASC';
    const col = q.sort.replace('-', '');
    const total = await query<{ n: number }>(`SELECT count(*)::int AS n FROM reminders r WHERE ${whereSql}`, params);
    params.push(q.pageSize, (q.page - 1) * q.pageSize);
    const rows = await query(`${SELECT} WHERE ${whereSql} ORDER BY r.${col} ${dir} NULLS LAST, r.id LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    res.json({ items: rows.rows, page: q.page, pageSize: q.pageSize, total: total.rows[0]?.n ?? 0 });
  }),
);

remindersRouter.post(
  '/',
  requirePermission('reminders.create'),
  validate({ body: reminderInput }),
  asyncHandler(async (req, res) => {
    const b = req.body as ReminderInput;
    const id = await withTx(async (db) => {
      const ins = await query<{ id: string }>(
        `INSERT INTO reminders (title, kind, status, reminder_date, content, custom_message, template_id, timezone, recurrence, recurrence_until, created_by, updated_by)
         VALUES ($1, $2, 'draft', $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $10) RETURNING id`,
        [b.title, b.kind, b.reminder_date, JSON.stringify(b.content), b.custom_message, b.template_id, b.timezone, b.recurrence, b.recurrence_until, req.admin!.id],
        db,
      );
      const rid = ins.rows[0]!.id;
      await setRecipients(db, rid, b.recipient_ids);
      await logActivity({ action: 'reminder.create', entityType: 'reminder', entityId: rid, metadata: { title: b.title, kind: b.kind } }, req, db);
      return rid;
    });
    res.status(201).json({ reminder: await load(id) });
  }),
);

remindersRouter.get(
  '/:id',
  requirePermission('reminders.read'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json({ reminder: await load(req.params.id!) });
  }),
);

remindersRouter.patch(
  '/:id',
  requirePermission('reminders.update'),
  validate({ params: idParams, body: reminderInput }),
  asyncHandler(async (req, res) => {
    const b = req.body as ReminderInput;
    const id = req.params.id!;
    await withTx(async (db) => {
      const cur = await query<{ status: string }>(`SELECT status FROM reminders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id], db);
      if (!cur.rows[0]) throw notFoundError('Reminder not found');
      if (!EDITABLE.includes(cur.rows[0].status)) throw conflict(`A ${cur.rows[0].status} reminder cannot be edited. Duplicate it instead.`);
      await query(
        `UPDATE reminders SET title=$2, kind=$3, reminder_date=$4, content=$5::jsonb, custom_message=$6, template_id=$7, timezone=$8,
           recurrence=$9, recurrence_until=$10, updated_by=$11 WHERE id=$1`,
        [id, b.title, b.kind, b.reminder_date, JSON.stringify(b.content), b.custom_message, b.template_id, b.timezone, b.recurrence, b.recurrence_until, req.admin!.id],
        db,
      );
      await setRecipients(db, id, b.recipient_ids);
      await logActivity({ action: 'reminder.update', entityType: 'reminder', entityId: id }, req, db);
    });
    res.json({ reminder: await load(id) });
  }),
);

remindersRouter.delete(
  '/:id',
  requirePermission('reminders.delete'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const id = req.params.id!;
    let cancelled: string[] = [];
    await withTx(async (db) => {
      const cur = await query(`SELECT 1 FROM reminders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id], db);
      if (!cur.rowCount) throw notFoundError('Reminder not found');
      cancelled = await cancelOpenJobs(db, id);
      await query(`UPDATE reminders SET deleted_at = now(), updated_by = $2, status = CASE WHEN status = 'pending' THEN 'cancelled'::reminder_status ELSE status END WHERE id = $1`, [id, req.admin!.id], db);
      await logActivity({ action: 'reminder.delete', entityType: 'reminder', entityId: id }, req, db);
    });
    await publishPlan({ job: null, cancelled });
    res.status(204).end();
  }),
);

remindersRouter.post(
  '/:id/duplicate',
  requirePermission('reminders.create'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const src = req.params.id!;
    const newId = await withTx(async (db) => {
      const ins = await query<{ id: string }>(
        `INSERT INTO reminders (title, kind, status, reminder_date, content, custom_message, template_id, timezone, recurrence, recurrence_until, source_reminder_id, created_by, updated_by)
         SELECT left('Copy of ' || title, 160), kind, 'draft'::reminder_status, reminder_date, content, custom_message, template_id, timezone, recurrence, recurrence_until, id, $2, $2
           FROM reminders WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
        [src, req.admin!.id],
        db,
      );
      if (!ins.rows[0]) throw notFoundError('Reminder not found');
      await query(`INSERT INTO reminder_recipients (reminder_id, recipient_id) SELECT $2, recipient_id FROM reminder_recipients WHERE reminder_id = $1`, [src, ins.rows[0].id], db);
      await logActivity({ action: 'reminder.duplicate', entityType: 'reminder', entityId: ins.rows[0].id, metadata: { source: src } }, req, db);
      return ins.rows[0].id;
    });
    res.status(201).json({ reminder: await load(newId) });
  }),
);

async function schedule(req: Request, id: string, runAt: Date, action: string) {
  let plan: Plan | null = null;
  await withTx(async (db) => {
    const cur = await query<{ status: string }>(`SELECT status FROM reminders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id], db);
    if (!cur.rows[0]) throw notFoundError('Reminder not found');
    if (!['draft', 'pending', 'cancelled'].includes(cur.rows[0].status)) throw conflict(`A ${cur.rows[0].status} reminder cannot be scheduled`);
    await requireAutomaticRecipients(db, id);
    await query(`UPDATE reminders SET status = 'pending', scheduled_at = $2, updated_by = $3 WHERE id = $1`, [id, runAt.toISOString(), req.admin!.id], db);
    plan = await planJob(db, id, runAt, 'send');
    await logActivity({ action, entityType: 'reminder', entityId: id, metadata: { runAt: runAt.toISOString() } }, req, db);
  });
  await publishPlan(plan as unknown as Plan);
}

remindersRouter.post(
  '/:id/schedule',
  requirePermission('schedule.manage'),
  validate({ params: idParams, body: scheduleBody }),
  asyncHandler(async (req, res) => {
    const runAt = new Date(req.body.scheduledAt);
    if (runAt.getTime() < Date.now() + 5_000) throw badRequest('Choose a time in the future, or use "Send now"');
    await schedule(req, req.params.id!, runAt, 'reminder.schedule');
    res.json({ reminder: await load(req.params.id!) });
  }),
);

remindersRouter.post(
  '/:id/send',
  requirePermission('reminders.send'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await schedule(req, req.params.id!, new Date(), 'reminder.send_now');
    res.status(202).json({ reminder: await load(req.params.id!) });
  }),
);

remindersRouter.post(
  '/:id/cancel',
  requirePermission('schedule.manage'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const id = req.params.id!;
    let cancelled: string[] = [];
    await withTx(async (db) => {
      const upd = await query(`UPDATE reminders SET status = 'cancelled', updated_by = $2 WHERE id = $1 AND status = 'pending' AND deleted_at IS NULL RETURNING id`, [id, req.admin!.id], db);
      if (!upd.rowCount) throw conflict('Only scheduled reminders can be cancelled');
      cancelled = await cancelOpenJobs(db, id);
      await logActivity({ action: 'reminder.cancel', entityType: 'reminder', entityId: id }, req, db);
    });
    await publishPlan({ job: null, cancelled });
    res.json({ reminder: await load(id) });
  }),
);

remindersRouter.post(
  '/:id/retry',
  requirePermission('reminders.send'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const id = req.params.id!;
    let plan = null as Plan | null;
    let queued = 0;
    await withTx(async (db) => {
      const cur = await query<{ status: string }>(`SELECT status FROM reminders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id], db);
      if (!cur.rows[0]) throw notFoundError('Reminder not found');
      if (cur.rows[0].status !== 'failed') throw conflict('Only failed reminders can be retried');
      plan = await planJob(db, id, new Date(), 'retry');
      const upd = await query(
        `UPDATE delivery_logs SET status = 'queued', job_id = $2, error_code = NULL, error_message = NULL WHERE reminder_id = $1 AND status = 'failed' RETURNING id`,
        [id, plan.job!.id],
        db,
      );
      queued = upd.rowCount ?? 0;
      await query(`UPDATE reminders SET status = 'pending', updated_by = $2 WHERE id = $1`, [id, req.admin!.id], db);
      await logActivity({ action: 'reminder.retry', entityType: 'reminder', entityId: id, metadata: { queued } }, req, db);
    });
    await publishPlan(plan as unknown as Plan);
    res.status(202).json({ queued });
  }),
);

remindersRouter.get(
  '/:id/deliveries',
  requirePermission('logs.delivery'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT d.id, d.reminder_id, NULL::text AS reminder_title, d.recipient_id, rc.name AS recipient_name, d.channel, d.status, d.wa_message_id,
              d.attempt, d.error_code, d.error_message, d.sent_at, d.delivered_at, d.read_at, d.created_at
         FROM delivery_logs d LEFT JOIN recipients rc ON rc.id = d.recipient_id
        WHERE d.reminder_id = $1 ORDER BY d.created_at, d.id`,
      [req.params.id],
    );
    res.json({ items: rows.rows });
  }),
);
