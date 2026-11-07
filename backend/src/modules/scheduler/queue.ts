import { Queue } from 'bullmq';
import type IORedis from 'ioredis';
import { env } from '../../config/env';
import { createRedis } from '../../lib/redis';

export const QUEUE_NAME = 'reminder-delivery';

export interface DeliverJobData {
  jobRowId: string;
  reminderId: string;
}

let connection: IORedis | null = null;
let queue: Queue<DeliverJobData> | null = null;

export function getQueue(): Queue<DeliverJobData> {
  if (!queue) {
    connection = createRedis();
    queue = new Queue<DeliverJobData>(QUEUE_NAME, { connection });
  }
  return queue;
}

/** BullMQ custom job ids may not contain ":", so the id is derived from the scheduled_jobs row id. */
export const queueJobId = (jobRowId: string) => `job-${jobRowId}`;

/** Adds (or no-ops if it already exists, thanks to the deterministic jobId) a delayed delivery job. */
export async function enqueue(data: DeliverJobData, runAt: Date): Promise<void> {
  await getQueue().add('deliver', data, {
    jobId: queueJobId(data.jobRowId),
    delay: Math.max(0, runAt.getTime() - Date.now()),
    attempts: env.DELIVERY_MAX_ATTEMPTS,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { age: 7 * 86_400 },
    removeOnFail: { age: 30 * 86_400 },
  });
}

export async function removeFromQueue(jobRowIds: string[]): Promise<void> {
  for (const id of jobRowIds) {
    try {
      const job = await getQueue().getJob(queueJobId(id));
      await job?.remove();
    } catch {
      // Active jobs cannot be removed; the processor re-checks the DB state and skips cancelled work.
    }
  }
}

export async function closeQueue(): Promise<void> {
  await queue?.close();
  connection?.disconnect();
  queue = null;
  connection = null;
}
