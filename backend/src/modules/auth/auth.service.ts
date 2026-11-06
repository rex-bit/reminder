import crypto from 'node:crypto';
import type { Request } from 'express';
import { env } from '../../config/env';
import { Db, pool, query, withTx } from '../../db/pool';
import { AppError, unauthorized } from '../../http/errors';
import { hashPassword, verifyPassword, DUMMY_HASH } from '../../security/password';
import { hashToken, newRefreshToken, signAccessToken } from '../../security/tokens';
import { logActivity } from '../activity/activity.service';
import { findAdminById, loadPermissionState } from '../admins/admins.repo';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const refreshTtlMs = () => env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

export interface Session {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

async function issueRefreshToken(
  adminId: string,
  familyId: string,
  req: Request,
  db: Db,
): Promise<{ token: string; expiresAt: Date; id: string }> {
  const token = newRefreshToken();
  const expiresAt = new Date(Date.now() + refreshTtlMs());
  const res = await query<{ id: string }>(
    `INSERT INTO refresh_tokens (admin_id, family_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [adminId, familyId, hashToken(token), expiresAt, req.get('user-agent')?.slice(0, 300) ?? null, req.ip ?? null],
    db,
  );
  return { token, expiresAt, id: res.rows[0]!.id };
}

export async function login(identifier: string, password: string, req: Request): Promise<Session> {
  const res = await query<{
    id: string;
    password_hash: string;
    status: string;
    token_version: number;
    failed_login_attempts: number;
    locked_until: Date | null;
  }>(
    `SELECT id, password_hash, status, token_version, failed_login_attempts, locked_until
       FROM admins
      WHERE deleted_at IS NULL AND (lower(username) = lower($1) OR lower(email) = lower($1))`,
    [identifier],
  );
  const admin = res.rows[0];

  if (!admin) {
    await verifyPassword(password, DUMMY_HASH); // equalize timing
    await logActivity({ action: 'auth.login_failed', metadata: { identifier: identifier.slice(0, 80), reason: 'unknown' } }, req);
    throw unauthorized('Invalid credentials');
  }

  if (admin.locked_until && admin.locked_until > new Date()) {
    await logActivity({ adminId: admin.id, action: 'auth.login_blocked', metadata: { reason: 'locked' } }, req);
    throw new AppError(423, 'account_locked', 'Account temporarily locked. Try again later.');
  }

  const ok = await verifyPassword(password, admin.password_hash);
  if (!ok) {
    const attempts = admin.failed_login_attempts + 1;
    const lock = attempts >= MAX_FAILED;
    await query(
      `UPDATE admins SET failed_login_attempts = $2,
              locked_until = CASE WHEN $3 THEN now() + make_interval(mins => $4) ELSE locked_until END
        WHERE id = $1`,
      [admin.id, lock ? 0 : attempts, lock, LOCK_MINUTES],
    );
    await logActivity({ adminId: admin.id, action: 'auth.login_failed', metadata: { reason: 'bad_password', locked: lock } }, req);
    throw unauthorized('Invalid credentials');
  }

  if (admin.status !== 'active') {
    await logActivity({ adminId: admin.id, action: 'auth.login_blocked', metadata: { reason: 'disabled' } }, req);
    throw new AppError(403, 'account_disabled', 'This account is disabled');
  }

  const refresh = await withTx(async (db) => {
    await query(
      `UPDATE admins SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`,
      [admin.id],
      db,
    );
    return issueRefreshToken(admin.id, crypto.randomUUID(), req, db);
  });

  await logActivity({ adminId: admin.id, action: 'auth.login' }, req);
  return {
    accessToken: signAccessToken({ sub: admin.id, tv: admin.token_version }),
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
  };
}

/** Rotates the refresh token. Reuse of an already-rotated token revokes the entire family. */
export async function refresh(token: string, req: Request): Promise<Session> {
  const hash = hashToken(token);
  const outcome = await withTx(async (db) => {
    const res = await query<{
      id: string;
      admin_id: string;
      family_id: string;
      expires_at: Date;
      revoked_at: Date | null;
    }>(`SELECT id, admin_id, family_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`, [hash], db);
    const row = res.rows[0];
    if (!row) return { error: 'invalid' as const };

    if (row.revoked_at) {
      // A rotated/revoked token came back: assume theft, kill the family.
      await query(`UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE family_id = $1`, [row.family_id], db);
      return { error: 'reuse' as const, adminId: row.admin_id };
    }
    if (row.expires_at <= new Date()) return { error: 'expired' as const };

    const admin = await findAdminById(row.admin_id, db);
    if (!admin || admin.status !== 'active') {
      await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`, [row.id], db);
      return { error: 'inactive' as const };
    }

    const next = await issueRefreshToken(admin.id, row.family_id, req, db);
    await query(`UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1`, [row.id, next.id], db);
    return { ok: true as const, admin, next };
  });

  if ('error' in outcome) {
    if (outcome.error === 'reuse') {
      await logActivity({ adminId: outcome.adminId, action: 'auth.refresh_reuse_detected' }, req);
    }
    throw unauthorized('Session expired, please sign in again');
  }
  return {
    accessToken: signAccessToken({ sub: outcome.admin.id, tv: outcome.admin.token_version }),
    refreshToken: outcome.next.token,
    refreshExpiresAt: outcome.next.expiresAt,
  };
}

export async function logout(token: string | undefined, req: Request): Promise<void> {
  if (!token) return;
  const res = await query<{ admin_id: string }>(
    `UPDATE refresh_tokens SET revoked_at = now()
      WHERE family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = $1) AND revoked_at IS NULL
      RETURNING admin_id`,
    [hashToken(token)],
  );
  const adminId = res.rows[0]?.admin_id;
  if (adminId) await logActivity({ adminId, action: 'auth.logout' }, req);
}

export async function changePassword(adminId: string, current: string, next: string, req: Request): Promise<Session> {
  const res = await query<{ password_hash: string }>(`SELECT password_hash FROM admins WHERE id = $1 AND deleted_at IS NULL`, [adminId]);
  const row = res.rows[0];
  if (!row || !(await verifyPassword(current, row.password_hash))) {
    throw new AppError(400, 'wrong_password', 'Current password is incorrect');
  }
  if (await verifyPassword(next, row.password_hash)) {
    throw new AppError(400, 'same_password', 'New password must be different from the current one');
  }
  const newHash = await hashPassword(next);

  const session = await withTx(async (db) => {
    const upd = await query<{ token_version: number }>(
      `UPDATE admins SET password_hash = $2, must_change_password = false, token_version = token_version + 1
        WHERE id = $1 RETURNING token_version`,
      [adminId, newHash],
      db,
    );
    // Sign out everywhere, then start a fresh session for this device.
    await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE admin_id = $1 AND revoked_at IS NULL`, [adminId], db);
    const refreshToken = await issueRefreshToken(adminId, crypto.randomUUID(), req, db);
    return { tv: upd.rows[0]!.token_version, refreshToken };
  });

  await logActivity({ adminId, action: 'auth.password_changed' }, req);
  return {
    accessToken: signAccessToken({ sub: adminId, tv: session.tv }),
    refreshToken: session.refreshToken.token,
    refreshExpiresAt: session.refreshToken.expiresAt,
  };
}

export async function getMe(adminId: string) {
  const admin = await findAdminById(adminId);
  if (!admin) throw unauthorized();
  const { effective } = await loadPermissionState(admin.id, admin.role_key);
  const { token_version: _tv, ...publicAdmin } = admin;
  return { ...publicAdmin, permissions: [...effective].sort() };
}

export async function purgeExpiredRefreshTokens(): Promise<number> {
  const res = await pool.query(`DELETE FROM refresh_tokens WHERE expires_at < now() - interval '7 days'`);
  return res.rowCount ?? 0;
}
