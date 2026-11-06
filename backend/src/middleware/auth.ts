import type { RequestHandler } from 'express';
import { forbidden, unauthorized } from '../http/errors';
import { loadAdminContext } from '../modules/admins/admins.repo';
import { verifyAccessToken } from '../security/tokens';

/** Requires a valid Bearer access token for an active admin; attaches req.admin. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.get('authorization') ?? '';
    const match = /^Bearer (.+)$/i.exec(header);
    if (!match?.[1]) throw unauthorized();

    const claims = verifyAccessToken(match[1]);
    if (!claims) throw unauthorized('Invalid or expired token');

    const admin = await loadAdminContext(claims.sub);
    if (!admin || admin.token_version !== claims.tv) throw unauthorized('Session is no longer valid');
    if (admin.status !== 'active') throw forbidden('Account is disabled');

    req.admin = admin;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * While `must_change_password` is set, only the endpoints that call this middleware's
 * counterpart (`allowPasswordChange`) are usable.
 */
export const blockUntilPasswordChanged: RequestHandler = (req, _res, next) => {
  if (req.admin?.must_change_password) {
    return next(forbidden('Password change required before using the system'));
  }
  next();
};
