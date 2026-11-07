import IORedis from 'ioredis';
import { env } from '../config/env';
import { logger } from '../config/logger';

/** BullMQ requires maxRetriesPerRequest: null on its connections. */
export function createRedis(): IORedis {
  const conn = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
  conn.on('error', (err) => logger.error({ err: err.message }, 'redis error'));
  return conn;
}
