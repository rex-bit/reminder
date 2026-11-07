import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { pool } from './db/pool';
import { errorHandler, notFoundHandler } from './http/errors';
import { globalLimiter } from './http/rateLimit';
import { activityRouter } from './modules/activity/activity.routes';
import { adminsRouter, permissionsRouter } from './modules/admins/admins.routes';
import { authRouter } from './modules/auth/auth.routes';
import { deliveriesRouter } from './modules/deliveries/deliveries.routes';
import { internalRouter } from './modules/internal/internal.routes';
import { recipientsRouter } from './modules/recipients/recipients.routes';
import { remindersRouter } from './modules/reminders/reminders.routes';
import { settingsRouter } from './modules/settings/settings.routes';
import { templatesRouter } from './modules/templates/templates.routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/healthz' } }));
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.CORS_ORIGINS.includes(origin)),
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Idempotency-Key'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/healthz', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'database_unavailable' });
    }
  });

  const api = express.Router();
  api.use(globalLimiter);
  api.use('/auth', authRouter);
  api.use('/activity', activityRouter);
  api.use('/reminders', remindersRouter);
  api.use('/templates', templatesRouter);
  api.use('/recipients', recipientsRouter);
  api.use('/admins', adminsRouter);
  api.use('/permissions', permissionsRouter);
  api.use('/settings', settingsRouter);
  api.use('/delivery-logs', deliveriesRouter);
  api.use('/internal', internalRouter);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
