import { env } from './config/env';
import { logger } from './config/logger';
import { createApp } from './app';
import { pool } from './db/pool';
import { startScheduler, stopScheduler } from './modules/scheduler';

async function main() {
  const app = createApp();
  const server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, 'API listening'));

  // Scheduling failures (e.g. Redis down) must not stop the API from serving; reconcile retries every minute.
  startScheduler().catch((err) => logger.error({ err }, 'scheduler failed to start'));

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close();
    await stopScheduler().catch(() => undefined);
    await pool.end().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
