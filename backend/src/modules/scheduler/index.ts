import { Worker } from 'bullmq';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { query } from '../../db/pool';
import { createRedis } from '../../lib/redis';
import { enqueue, getQueue, QUEUE_NAME, queueJobId, closeQueue } from './queue';
import { processDelivery, RetryLater } from './processor';

let worker: Worker | null = null;
let timer: NodeJS.Timeout | null = null;

/**
 * The database is the source of truth. If Redis lost its data (or enqueue failed), rows that should be
 * in the queue but are not get re-added here. Running it on every boot and every minute is safe because
 * job ids are deterministic.
 */
export async function reconcile(): Promise<number> {
  const rows = await query<{ id: string; reminder_id: string; run_at: Date }>(
    `SELECT id, reminder_id, run_at FROM scheduled_jobs
      WHERE status IN ('scheduled', 'queued') OR (status = 'active' AND started_at < now() - interval '10 minutes')`,
  );
  let added = 0;
  for (const r of rows.rows) {
    const existing = await getQueue().getJob(queueJobId(r.id));
    if (existing) {
      const state = await existing.getState();
      if (state !== 'completed' && state !== 'failed') continue;
      await existing.remove().catch(() => undefined);
    }
    await enqueue({ jobRowId: r.id, reminderId: r.reminder_id }, r.run_at);
    await query(`UPDATE scheduled_jobs SET status = 'queued' WHERE id = $1`, [r.id]);
    added++;
  }
  if (added) logger.warn({ added }, 'reconcile re-enqueued jobs missing from the queue');
  return added;
}

export async function startScheduler(): Promise<void> {
  await reconcile().catch((err) => logger.error({ err }, 'initial reconcile failed'));
  timer = setInterval(() => reconcile().catch((err) => logger.error({ err }, 'reconcile failed')), 60_000);

  if (!env.RUN_WORKER) return;
  worker = new Worker(QUEUE_NAME, processDelivery, { connection: createRedis(), concurrency: 2, limiter: { max: 20, duration: 1000 } });
  worker.on('failed', async (job, err) => {
    if (err instanceof RetryLater) return logger.warn({ jobId: job?.id, msg: err.message }, 'delivery retry scheduled');
    logger.error({ jobId: job?.id, err }, 'delivery job failed');
    // Unexpected error (not a delivery failure): mark the row so the problem is visible in the UI.
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await query(`UPDATE scheduled_jobs SET status = 'failed', finished_at = now(), last_error = $2 WHERE id = $1`, [job.data.jobRowId, String(err.message).slice(0, 500)]).catch(() => undefined);
      await query(`UPDATE reminders SET status = 'failed' WHERE id = $1 AND status = 'pending'`, [job.data.reminderId]).catch(() => undefined);
    }
  });
  worker.on('error', (err) => logger.error({ err: err.message }, 'worker error'));
  logger.info('delivery worker started');
}

export async function stopScheduler(): Promise<void> {
  if (timer) clearInterval(timer);
  await worker?.close();
  await closeQueue();
}
