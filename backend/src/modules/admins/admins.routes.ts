import { Router } from 'express';
import { z } from 'zod';
import { AppError, asyncHandler, forbidden, notFoundError } from '../../http/errors';
import { validate } from '../../http/validate';
import { Db, query, withTx } from '../../db/pool';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { ALL_PERMISSION_KEYS, DEFAULT_ADMIN_PERMISSIONS, PERMISSIONS } from '../../rbac/permissions';
import { hashPassword, passwordSchema } from '../../security/password';
import { logActivity } from '../activity/activity.service';
import { getMe } from '../auth/auth.service';
import { idParams } from '../reminders/reminders.schema';
import { loadPermissionState } from './admins.repo';

export const adminsRouter = Router();
export const permissionsRouter = Router();

const ADMIN_ROLE_ID = 2;
const permList = z.array(z.string().refine((k) => ALL_PERMISSION_KEYS.includes(k), 'Unknown permission')).max(ALL_PERMISSION_KEYS.length);

const createBody = z.object({
  username: z.string().regex(/^[A-Za-z0-9_.-]{3,32}$/, '3-32 letters, numbers, . _ -'),
  email: z.string().trim().email().max(254),
  display_name: z.string().trim().min(1).max(80),
  password: passwordSchema,
  permissions: permList.default([...DEFAULT_ADMIN_PERMISSIONS]),
});
const updateBody = z.object({
  display_name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().email().max(254).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  permissions: permList.optional(),
});
const meBody = z.object({ display_name: z.string().trim().min(1).max(80).optional(), email: z.string().trim().email().max(254).optional() });
const resetBody = z.object({ password: passwordSchema });

permissionsRouter.get('/', authenticate, requirePermission('admins.read'), (_req, res) => {
  res.json({ items: PERMISSIONS, defaults: DEFAULT_ADMIN_PERMISSIONS });
});

adminsRouter.use(authenticate);

/** Stores overrides relative to the admin role's defaults. Enforces: only grant what you hold yourself. */
async function applyPermissions(db: Db, targetId: string, desired: string[], actor: { id: string; permissions: Set<string> }) {
  const target = await query<{ role_key: string }>(`SELECT r.key AS role_key FROM admins a JOIN roles r ON r.id = a.role_id WHERE a.id = $1`, [targetId], db);
  const state = await loadPermissionState(targetId, target.rows[0]?.role_key ?? 'admin', db);
  const want = new Set(desired);
  for (const k of want) {
    if (!state.effective.has(k) && !actor.permissions.has(k)) throw forbidden(`You cannot grant "${k}" because you do not have it yourself`);
  }
  const roleDefaults = new Set(state.rolePermissions);
  await query(`DELETE FROM admin_permissions WHERE admin_id = $1`, [targetId], db);
  const rows: Array<[string, boolean]> = [];
  for (const k of ALL_PERMISSION_KEYS) {
    if (want.has(k) && !roleDefaults.has(k)) rows.push([k, true]);
    if (!want.has(k) && roleDefaults.has(k)) rows.push([k, false]);
  }
  for (const [k, granted] of rows) {
    await query(`INSERT INTO admin_permissions (admin_id, permission_id, granted, granted_by) SELECT $1, id, $3, $4 FROM permissions WHERE key = $2`, [targetId, k, granted, actor.id], db);
  }
}

const revokeSessions = async (db: Db, adminId: string) => {
  await query(`UPDATE admins SET token_version = token_version + 1 WHERE id = $1`, [adminId], db);
  await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE admin_id = $1 AND revoked_at IS NULL`, [adminId], db);
};

async function targetAdmin(id: string, db?: Db) {
  const r = await query<{ id: string; role_key: string }>(`SELECT a.id, r.key AS role_key FROM admins a JOIN roles r ON r.id = a.role_id WHERE a.id = $1 AND a.deleted_at IS NULL`, [id], db);
  if (!r.rows[0]) throw notFoundError('Admin not found');
  return r.rows[0];
}

adminsRouter.get('/', requirePermission('admins.read'), asyncHandler(async (_req, res) => {
  const ids = await query<{ id: string }>(`SELECT id FROM admins WHERE deleted_at IS NULL ORDER BY created_at`);
  res.json({ items: await Promise.all(ids.rows.map((r) => getMe(r.id))) });
}));

adminsRouter.post('/', requirePermission('admins.create'), validate({ body: createBody }), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof createBody>;
  const actor = req.admin!;
  const sameAsDefault = b.permissions.length === DEFAULT_ADMIN_PERMISSIONS.length && DEFAULT_ADMIN_PERMISSIONS.every((k) => b.permissions.includes(k));
  if (!sameAsDefault && !actor.permissions.has('admins.permissions')) throw forbidden('You are not allowed to set custom permissions');
  const hash = await hashPassword(b.password);
  const id = await withTx(async (db) => {
    const ins = await query<{ id: string }>(
      `INSERT INTO admins (username, email, display_name, password_hash, role_id, must_change_password, created_by) VALUES ($1,$2,$3,$4,$5,true,$6) RETURNING id`,
      [b.username, b.email, b.display_name, hash, ADMIN_ROLE_ID, actor.id],
      db,
    );
    const newId = ins.rows[0]!.id;
    await applyPermissions(db, newId, b.permissions, actor);
    await logActivity({ action: 'admin.create', entityType: 'admin', entityId: newId, metadata: { username: b.username } }, req, db);
    return newId;
  });
  res.status(201).json({ admin: await getMe(id) });
}));

const avatarBody = z.object({ avatar: z.string().max(60000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/).nullable() });

adminsRouter.put('/me/avatar', validate({ body: avatarBody }), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof avatarBody>;
  await query(`UPDATE admins SET avatar_url = $2 WHERE id = $1`, [req.admin!.id, b.avatar]);
  await logActivity({ action: b.avatar ? 'admin.set_avatar' : 'admin.remove_avatar', entityType: 'admin', entityId: req.admin!.id }, req);
  res.json({ admin: await getMe(req.admin!.id) });
}));

// Registered before "/:id" so "me" is not parsed as an id.
adminsRouter.patch('/me', validate({ body: meBody }), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof meBody>;
  await query(`UPDATE admins SET display_name = COALESCE($2, display_name), email = COALESCE($3, email) WHERE id = $1`, [req.admin!.id, b.display_name ?? null, b.email ?? null]);
  await logActivity({ action: 'admin.update_profile', entityType: 'admin', entityId: req.admin!.id }, req);
  res.json({ admin: await getMe(req.admin!.id) });
}));

adminsRouter.patch('/:id', requirePermission('admins.update'), validate({ params: idParams, body: updateBody }), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof updateBody>;
  const id = req.params.id!;
  const actor = req.admin!;
  await withTx(async (db) => {
    const target = await targetAdmin(id, db);
    const isOwner = target.role_key === 'owner';
    if (isOwner && actor.role_key !== 'owner') throw forbidden('Only the Owner can edit the Owner account');
    if (isOwner && (b.status || b.permissions)) throw new AppError(400, 'owner_immutable', 'The Owner account cannot be disabled or have its permissions changed');
    if (id === actor.id && b.status === 'disabled') throw new AppError(400, 'self_disable', 'You cannot disable your own account');
    if (b.permissions && !actor.permissions.has('admins.permissions')) throw forbidden('You are not allowed to change permissions');

    await query(`UPDATE admins SET display_name = COALESCE($2, display_name), email = COALESCE($3, email), status = COALESCE($4::admin_status, status) WHERE id = $1`,
      [id, b.display_name ?? null, b.email ?? null, b.status ?? null], db);
    if (b.permissions) await applyPermissions(db, id, b.permissions, actor);
    // Permissions are read on every request, so they apply immediately. Disabling must also kill existing sessions.
    if (b.status === 'disabled') await revokeSessions(db, id);
    await logActivity({ action: 'admin.update', entityType: 'admin', entityId: id, metadata: { fields: Object.keys(b) } }, req, db);
  });
  res.json({ admin: await getMe(id) });
}));

adminsRouter.post('/:id/reset-password', requirePermission('admins.update'), validate({ params: idParams, body: resetBody }), asyncHandler(async (req, res) => {
  const id = req.params.id!;
  const hash = await hashPassword((req.body as z.infer<typeof resetBody>).password);
  await withTx(async (db) => {
    const target = await targetAdmin(id, db);
    if (target.role_key === 'owner') throw forbidden('The Owner password cannot be reset here');
    await query(`UPDATE admins SET password_hash = $2, must_change_password = true, failed_login_attempts = 0, locked_until = NULL WHERE id = $1`, [id, hash], db);
    await revokeSessions(db, id);
    await logActivity({ action: 'admin.reset_password', entityType: 'admin', entityId: id }, req, db);
  });
  res.status(204).end();
}));

adminsRouter.delete('/:id', requirePermission('admins.delete'), validate({ params: idParams }), asyncHandler(async (req, res) => {
  const id = req.params.id!;
  if (id === req.admin!.id) throw new AppError(400, 'self_delete', 'You cannot remove your own account');
  await withTx(async (db) => {
    const target = await targetAdmin(id, db);
    if (target.role_key === 'owner') throw forbidden('The Owner account cannot be removed');
    await query(`UPDATE admins SET deleted_at = now(), status = 'disabled' WHERE id = $1`, [id], db);
    await revokeSessions(db, id);
    await logActivity({ action: 'admin.delete', entityType: 'admin', entityId: id }, req, db);
  });
  res.status(204).end();
}));
