import type { Job } from 'bullmq';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { query, withTx, type Db } from '../../db/pool';
import { buildMessage, type Content } from '../../lib/message';
import { addToDate, utcToZoned, zonedToUtc } from '../../lib/time';
import { logActivity } from '../activity/activity.service';
import { isPublicEnabled, publicNotification } from '../public/public.service';
import { notifyAdmins, pushReminder } from '../push/push.service';
import { dispatch } from './dispatch';
import type { DeliverJobData } from './queue';
import { planJob, publishPlan, type Plan } from './schedule';

interface JobRow {
  id: string;
  reminder_id: string;
  run_at: Date;
  status: string;
}
interface ReminderRow {
  id: string;
  title: string;
  kind: string;
  status: string;
  reminder_date: string;
  content: Content;
  custom_message: string | null;
  timezone: string;
  scheduled_at: Date | null;
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly';
  recurrence_until: string | null;
  delivery_method: 'whatsapp' | 'push' | 'both';
}
interface DeliveryRow {
  id: string;
  idempotency_key: string;
  message_body: string;
  attempt: number;
  type: 'individual' | 'group';
  phone_e164: string | null;
  wa_group_id: string | null;
}

/** Thrown to make BullMQ retry (exponential backoff) while some deliveries failed for transient reasons. */
export class RetryLater extends Error {}

export async function processDelivery(job: Job<DeliverJobData>): Promise<void> {
  const { jobRowId, reminderId } = job.data;
  const attempt = job.attemptsMade + 1;
  const maxAttempts = job.opts.attempts ?? env.DELIVERY_MAX_ATTEMPTS;

  // Claim. A cancelled/finished job row means the schedule changed after this queue entry was created.
  const claimed = await query<JobRow>(
    `UPDATE scheduled_jobs SET status = 'active', started_at = COALESCE(started_at, now()), attempts = $2
      WHERE id = $1 AND status IN ('scheduled', 'queued', 'active') RETURNING id, reminder_id, run_at, status`,
    [jobRowId, attempt],
  );
  if (!claimed.rows[0]) {
    logger.info({ jobRowId }, 'job no longer active, skipping');
    return;
  }
  const jobRow = claimed.rows[0];

  const rem = (await query<ReminderRow>(
    `SELECT id, title, kind, status, reminder_date, content, custom_message, timezone, scheduled_at, recurrence, recurrence_until, delivery_method
       FROM reminders WHERE id = $1 AND deleted_at IS NULL`,
    [reminderId],
  )).rows[0];
  if (!rem || !['pending', 'failed'].includes(rem.status)) {
    await query(`UPDATE scheduled_jobs SET status = 'cancelled', finished_at = now() WHERE id = $1`, [jobRowId]);
    return;
  }

  const wantsWhatsApp = rem.delivery_method !== 'push';
  const wantsPush = rem.delivery_method !== 'whatsapp';

  // Website push goes first and never throws: a WhatsApp problem must not block it (and vice versa).
  let pushProblem: string | null = null;
  if (wantsPush) pushProblem = await runPush(rem, (rem.scheduled_at ?? jobRow.run_at).getTime());
  if (!wantsWhatsApp) {
    await finalize(rem, jobRowId, pushProblem === null, pushProblem);
    return;
  }

  // Create one delivery row per automatic recipient. The unique idempotency key makes a re-run a no-op.
  // Keyed on the reminder's scheduled instant (not the job row) so retries and re-runs never create a second delivery for the same recipient.
  const runKey = (rem.scheduled_at ?? jobRow.run_at).getTime();
  const message = buildMessage(rem);
  await query(
    `INSERT INTO delivery_logs (reminder_id, job_id, recipient_id, channel, status, idempotency_key, message_body)
     SELECT $1::uuid, $2::uuid, r.id, r.channel, 'queued'::delivery_status, $5::text || r.id::text || ':run:' || $3::text, $4::text
       FROM reminder_recipients rr JOIN recipients r ON r.id = rr.recipient_id
      WHERE rr.reminder_id = $1 AND r.is_active AND r.deleted_at IS NULL AND r.channel = 'whatsapp_cloud'
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [reminderId, jobRowId, String(runKey), message, `reminder:${reminderId}:recipient:`],
  );

  const pending = await query<DeliveryRow>(
    `SELECT d.id, d.idempotency_key, d.message_body, d.attempt, r.type, r.phone_e164, r.wa_group_id
       FROM delivery_logs d JOIN recipients r ON r.id = d.recipient_id
      WHERE d.reminder_id = $1 AND d.status = 'queued' ORDER BY d.created_at`,
    [reminderId],
  );

  // Manual-share recipients are never sent by the system: they become "due" tasks and admins are notified.
  await query(
    `INSERT INTO manual_shares (reminder_id, recipient_id, due_at)
     SELECT $1::uuid, r.id, now() FROM reminder_recipients rr JOIN recipients r ON r.id = rr.recipient_id
      WHERE rr.reminder_id = $1 AND r.is_active AND r.deleted_at IS NULL AND r.channel = 'manual_share'
     ON CONFLICT (reminder_id, recipient_id) DO NOTHING`,
    [reminderId],
  );

  const total = await query<{ n: string }>(`SELECT count(*) AS n FROM delivery_logs WHERE reminder_id = $1`, [reminderId]);
  if (Number(total.rows[0]?.n ?? 0) === 0) {
    const manual = await query<{ n: string }>(`SELECT count(*) AS n FROM manual_shares WHERE reminder_id = $1`, [reminderId]);
    if (Number(manual.rows[0]?.n ?? 0) === 0) await finalize(rem, jobRowId, false, 'No active recipients for this reminder');
    else await finalize(rem, jobRowId, true, null); // manual-only reminder: becomes "due"
    return;
  }

  const groupsOn = (await query<{ value: unknown }>(`SELECT value FROM app_settings WHERE key = 'whatsapp.groups_supported'`)).rows[0]?.value === true;

  for (const d of pending.rows) {
    // Groups need an eligible number (Official Business Account, Cloud API number); off unless an admin confirmed it in Settings.
    const res = d.type === 'group' && !groupsOn
      ? ({ ok: false, retryable: false, code: 'groups_not_supported', message: 'Group messaging is not enabled for this WhatsApp number. Use manual sharing for groups.' } as const)
      : await dispatch({
      deliveryId: d.id,
      body: d.message_body,
      recipient: { type: d.type, phone_e164: d.phone_e164, wa_group_id: d.wa_group_id },
    });
    if (res.ok) {
      await query(
        `UPDATE delivery_logs SET status = 'accepted', wa_message_id = $2, error_code = NULL, error_message = NULL WHERE id = $1`,
        [d.id, res.messageId],
      );
    } else {
      const giveUp = !res.retryable || attempt >= maxAttempts;
      await query(
        `UPDATE delivery_logs SET status = $2::delivery_status, attempt = attempt + 1, error_code = $3, error_message = $4 WHERE id = $1`,
        [d.id, giveUp ? 'failed' : 'queued', res.code, res.message.slice(0, 500)],
      );
    }
  }

  const left = await query<{ n: string }>(`SELECT count(*) AS n FROM delivery_logs WHERE reminder_id = $1 AND status = 'queued'`, [reminderId]);
  if (Number(left.rows[0]?.n ?? 0) > 0) throw new RetryLater(`${left.rows[0]?.n} deliveries will be retried`);

  const failed = await query<{ n: string }>(`SELECT count(*) AS n FROM delivery_logs WHERE reminder_id = $1 AND status = 'failed'`, [reminderId]);
  const anyFailed = Number(failed.rows[0]?.n ?? 0) > 0;
  await finalize(rem, jobRowId, !anyFailed, anyFailed ? 'One or more deliveries failed' : null);
}

async function finalize(rem: ReminderRow, jobRowId: string, ok: boolean, error: string | null): Promise<void> {
  let plan = null as Plan | null;
  let newStatus = 'failed' as 'sent' | 'due' | 'failed'; // assigned inside the transaction callback; the cast stops TS narrowing it to 'failed'
  await withTx(async (db) => {
    if (ok) {
      const open = await query<{ n: string }>(`SELECT count(*) AS n FROM manual_shares WHERE reminder_id = $1 AND status = 'due'`, [rem.id], db);
      newStatus = Number(open.rows[0]?.n ?? 0) > 0 ? 'due' : 'sent';
    }
    await query(`UPDATE scheduled_jobs SET status = $2::job_status, finished_at = now(), last_error = $3 WHERE id = $1`, [jobRowId, ok ? 'completed' : 'failed', error], db);
    await query(
      `UPDATE reminders SET status = $2::reminder_status, sent_at = CASE WHEN $3::boolean THEN now() ELSE sent_at END WHERE id = $1`,
      [rem.id, newStatus, newStatus === 'sent'],
      db,
    );
    // The next occurrence is created now (not when an admin marks "due" as sent), so a forgotten task never stops a series.
    if (ok) plan = await createNextOccurrence(db, rem);
    await logActivity({ action: ok ? `reminder.${newStatus}` : 'reminder.failed', entityType: 'reminder', entityId: rem.id, metadata: error ? { error } : {} }, undefined, db);
  });
  if (plan) await publishPlan(plan);
  if (newStatus === 'due') {
    await notifyAdmins('reminders.send', { title: `Perlu dikirim: ${rem.title}`, body: 'Ketuk untuk membuka dan kirim ke WhatsApp.', reminderId: rem.id, tag: `due-${rem.id}` }).catch((err) =>
      logger.warn({ err }, 'push notification failed'),
    );
  }
}

/** Recurring reminders: create the next occurrence as its own pending reminder (copying recipients). */
async function createNextOccurrence(db: Db, rem: ReminderRow): Promise<Plan | null> {
  if (rem.recurrence === 'none' || !rem.scheduled_at) return null;
  const nextDate = addToDate(rem.reminder_date, rem.recurrence);
  if (rem.recurrence_until && nextDate > rem.recurrence_until) return null;

  const exists = await query(`SELECT 1 FROM reminders WHERE source_reminder_id = $1 AND reminder_date = $2 AND deleted_at IS NULL`, [rem.id, nextDate], db);
  if (exists.rowCount) return null;

  const wall = utcToZoned(rem.scheduled_at, rem.timezone);
  const nextRun = zonedToUtc(addToDate(wall.date, rem.recurrence), wall.time, rem.timezone);
  const ins = await query<{ id: string }>(
    `INSERT INTO reminders (title, kind, status, reminder_date, content, custom_message, template_id, timezone, scheduled_at, recurrence, recurrence_until, delivery_method, source_reminder_id, created_by)
     SELECT title, kind, 'pending'::reminder_status, $2::date, content, custom_message, template_id, timezone, $3::timestamptz, recurrence, recurrence_until, delivery_method, id, created_by FROM reminders WHERE id = $1
     RETURNING id`,
    [rem.id, nextDate, nextRun.toISOString()],
    db,
  );
  const newId = ins.rows[0]!.id;
  await query(`INSERT INTO reminder_recipients (reminder_id, recipient_id) SELECT $2, recipient_id FROM reminder_recipients WHERE reminder_id = $1`, [rem.id, newId], db);
  return planJob(db, newId, nextRun, 'send');
}

/**
 * Sends the website push for this occurrence once. UNIQUE(reminder_id, run_key) makes BullMQ retries and WhatsApp retries
 * harmless; only a previous failed/skipped push is attempted again. Returns a problem description, or null when it was sent.
 */
async function runPush(rem: ReminderRow, runKey: number): Promise<string | null> {
  const claim = await query<{ id: string }>(
    `INSERT INTO push_deliveries (reminder_id, run_key) VALUES ($1, $2)
     ON CONFLICT (reminder_id, run_key) DO UPDATE SET status = 'sending', error_message = NULL, finished_at = NULL
       WHERE push_deliveries.status IN ('failed', 'skipped')
     RETURNING id`,
    [rem.id, String(runKey)],
  );
  const id = claim.rows[0]?.id;
  if (!id) {
    const cur = await query<{ status: string; error_message: string | null }>(`SELECT status, error_message FROM push_deliveries WHERE reminder_id = $1 AND run_key = $2`, [rem.id, String(runKey)]);
    return cur.rows[0]?.status === 'sent' ? null : (cur.rows[0]?.error_message ?? 'Push notification is already being sent');
  }
  try {
    const pub = await isPublicEnabled().catch(() => false);
    const payload = publicNotification(rem);
    const res = await pushReminder({ ...payload, path: `reminders/${rem.id}` }, pub ? payload : null);
    let status: 'sent' | 'failed' | 'skipped';
    let error: string | null = null;
    if (res.reason === 'not_configured') {
      status = 'skipped';
      error = 'Web Push is not configured (set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT)';
    } else if (res.reason === 'no_devices') {
      status = 'skipped';
      error = 'No devices have notifications enabled yet';
    } else if (res.sent === 0) {
      status = 'failed';
      error = `All ${res.total} push deliveries were rejected by the push service`;
    } else status = 'sent';
    await query(
      `UPDATE push_deliveries SET status = $2, devices_total = $3, devices_sent = $4, devices_failed = $5, error_message = $6, finished_at = now() WHERE id = $1`,
      [id, status, res.total, res.sent, res.failed, error],
    );
    return status === 'sent' ? null : error;
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 300) : 'push failed';
    logger.warn({ err }, 'reminder push failed');
    await query(`UPDATE push_deliveries SET status = 'failed', error_message = $2, finished_at = now() WHERE id = $1`, [id, msg]);
    return msg;
  }
}
