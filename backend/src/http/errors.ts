import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new AppError(400, 'bad_request', msg, details);
export const unauthorized = (msg = 'Authentication required') => new AppError(401, 'unauthorized', msg);
export const forbidden = (msg = 'You do not have permission to do this') => new AppError(403, 'forbidden', msg);
export const notFoundError = (msg = 'Not found') => new AppError(404, 'not_found', msg);
export const conflict = (msg: string) => new AppError(409, 'conflict', msg);

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'validation_error',
        message: 'Invalid input',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }
  // Postgres unique violation
  if (typeof err === 'object' && err && (err as { code?: string }).code === '23505') {
    res.status(409).json({ error: { code: 'conflict', message: 'A record with these values already exists' } });
    return;
  }
  if (typeof err === 'object' && err && (err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'bad_request', message: 'Malformed JSON body' } });
    return;
  }
  logger.error({ err, path: req.path }, 'unhandled error');
  res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
};
