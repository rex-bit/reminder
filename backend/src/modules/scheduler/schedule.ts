import type { Db } from '../../db/pool';
import { query } from '../../db/pool';
import { enqueue, removeFromQueue } from './queue';

export interface PlannedJob {
  id: string;
  reminderId: string;
  runAt: Date;
}
export interface Plan {
  job: PlannedJob | null;
  cancelled: string[];
}

/** Cancels every not-yet-finished job of a reminder. Returns the ids to remove from the queue after COMMIT. */
export async function cancelOpenJobs(db: Db, reminderId: string): Promise<string[]> {
  const res = await query<{ id: string }>(
    `UPDATE scheduled_jobs SET status = 'cancelled', finished_at = now()
      WHERE reminder_id = $1 AND status IN ('scheduled', 'queued') RETURNING id`,
    [reminderId],
    db,
  );
  return res.rows.map((r) => r.id);
}

/**
 * Records a job row inside the caller's transaction. The idempotency key makes scheduling the same
 * reminder for the same instant twice resolve to one job.
 */
export async function planJob(db: Db, reminderId: string, runAt: Date, kind: 'send' | 'retry'): Promise<Plan> {
  const cancelled = await cancelOpenJobs(db, reminderId);
  const key = `reminder:${reminderId}:${kind}:${runAt.getTime()}`;
  const res = await query<{ id: string }>(
    `INSERT INTO scheduled_jobs (reminder_id, run_at, status, idempotency_key, max_attempts)
     VALUES ($1, $2, 'scheduled', $3, $4)
     ON CONFLICT (idempotency_key) DO UPDATE SET status = 'scheduled', run_at = EXCLUDED.run_at, finished_at = NULL, last_error = NULL
     RETURNING id`,
    [reminderId, runAt.toISOString(), key, Number(process.env.DELIVERY_MAX_ATTEMPTS ?? 5)],
    db,
  );
  const id = res.rows[0]!.id;
  await query(`UPDATE scheduled_jobs SET queue_job_id = $2 WHERE id = $1`, [id, `job-${id}`], db);
  return { job: { id, reminderId, runAt }, cancelled: cancelled.filter((c) => c !== id) };
}

/** Call AFTER the transaction committed. If Redis is down the DB row stays 'scheduled' and reconcile() enqueues it later. */
export async function publishPlan(plan: Plan): Promise<void> {
  await removeFromQueue(plan.cancelled);
  if (!plan.job) return;
  try {
    await enqueue({ jobRowId: plan.job.id, reminderId: plan.job.reminderId }, plan.job.runAt);
    await query(`UPDATE scheduled_jobs SET status = 'queued' WHERE id = $1 AND status = 'scheduled'`, [plan.job.id]);
  } catch (err) {
    // Not fatal: the periodic reconcile picks up 'scheduled' rows that are missing from the queue.
    const { logger } = await import('../../config/logger');
    logger.error({ err, jobId: plan.job.id }, 'enqueue failed; will be retried by reconcile');
  }
}
