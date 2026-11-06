import { Router, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { asyncHandler, forbidden, unauthorized } from '../../http/errors';
import { loginLimiter, refreshLimiter } from '../../http/rateLimit';
import { validate } from '../../http/validate';
import { authenticate } from '../../middleware/auth';
import { passwordSchema } from '../../security/password';
import * as auth from './auth.service';

export const authRouter = Router();

const COOKIE_NAME = 'rt';
const COOKIE_PATH = '/api/v1/auth';

function setRefreshCookie(res: Response, token: string, expires: Date) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    domain: env.COOKIE_DOMAIN,
    path: COOKIE_PATH,
    expires,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    domain: env.COOKIE_DOMAIN,
    path: COOKIE_PATH,
  });
}

/** CSRF defense for cookie-authenticated endpoints: a custom header cannot be sent cross-site without a CORS preflight. */
const requireCsrfHeader: RequestHandler = (req, _res, next) => {
  if (req.get('x-requested-with') !== 'reminder-web') return next(forbidden('Missing CSRF header'));
  next();
};

const loginBody = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
});

authRouter.post(
  '/login',
  loginLimiter,
  validate({ body: loginBody }),
  asyncHandler(async (req, res) => {
    const session = await auth.login(req.body.identifier, req.body.password, req);
    setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
    res.json({ accessToken: session.accessToken, admin: await auth.getMe(JSON.parse(atob(session.accessToken.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))).sub) });
  }),
);

authRouter.post(
  '/refresh',
  refreshLimiter,
  requireCsrfHeader,
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (!token) throw unauthorized('No session');
    try {
      const session = await auth.refresh(token, req);
      setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
      res.json({ accessToken: session.accessToken });
    } catch (err) {
      clearRefreshCookie(res);
      throw err;
    }
  }),
);

authRouter.post(
  '/logout',
  requireCsrfHeader,
  asyncHandler(async (req, res) => {
    await auth.logout(req.cookies?.[COOKIE_NAME] as string | undefined, req);
    clearRefreshCookie(res);
    res.status(204).end();
  }),
);

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ admin: await auth.getMe(req.admin!.id) });
  }),
);

const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

// Allowed even while must_change_password is set.
authRouter.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordBody }),
  asyncHandler(async (req, res) => {
    const session = await auth.changePassword(req.admin!.id, req.body.currentPassword, req.body.newPassword, req);
    setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
    res.json({ accessToken: session.accessToken });
  }),
);
