import type { RequestHandler } from 'express';
import { forbidden, unauthorized } from '../http/errors';

/** Requires ALL listed permissions. Must run after `authenticate`. Also blocks admins who must change their password. */
export function requirePermission(...keys: string[]): RequestHandler {
  return (req, _res, next) => {
    const admin = req.admin;
    if (!admin) return next(unauthorized());
    if (admin.must_change_password) return next(forbidden('Password change required before using the system'));
    const missing = keys.filter((k) => !admin.permissions.has(k));
    if (missing.length > 0) return next(forbidden(`Missing permission: ${missing.join(', ')}`));
    next();
  };
}

export const requireOwner: RequestHandler = (req, _res, next) => {
  if (!req.admin) return next(unauthorized());
  if (req.admin.role_key !== 'owner') return next(forbidden('Owner only'));
  next();
};
