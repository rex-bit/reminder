import { Db, pool, query } from '../../db/pool';
import { PermissionOverride, resolvePermissions } from '../../rbac/permissions';

export interface AdminRow {
  id: string;
  admin_code: string;
  username: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  status: 'active' | 'disabled';
  role_key: string;
  must_change_password: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface AdminContext extends AdminRow {
  token_version: number;
  permissions: Set<string>;
}

export const PUBLIC_COLUMNS = `a.id, a.admin_code, a.username, a.email, a.display_name, a.avatar_url, a.status,
  r.key AS role_key, a.must_change_password, a.last_login_at, a.created_at, a.updated_at`;

export async function findAdminById(id: string, db: Db = pool): Promise<(AdminRow & { token_version: number }) | null> {
  const res = await query<AdminRow & { token_version: number }>(
    `SELECT ${PUBLIC_COLUMNS}, a.token_version
       FROM admins a JOIN roles r ON r.id = a.role_id
      WHERE a.id = $1 AND a.deleted_at IS NULL`,
    [id],
    db,
  );
  return res.rows[0] ?? null;
}

export async function loadPermissionState(
  adminId: string,
  roleKey: string,
  db: Db = pool,
): Promise<{ rolePermissions: string[]; overrides: PermissionOverride[]; effective: Set<string> }> {
  const role = await query<{ key: string }>(
    `SELECT p.key FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       JOIN admins a ON a.role_id = rp.role_id
      WHERE a.id = $1`,
    [adminId],
    db,
  );
  const ov = await query<{ key: string; granted: boolean }>(
    `SELECT p.key, ap.granted FROM admin_permissions ap
       JOIN permissions p ON p.id = ap.permission_id
      WHERE ap.admin_id = $1`,
    [adminId],
    db,
  );
  const rolePermissions = role.rows.map((r) => r.key);
  const overrides = ov.rows.map((r) => ({ key: r.key, granted: r.granted }));
  return { rolePermissions, overrides, effective: resolvePermissions(roleKey, rolePermissions, overrides) };
}

export async function loadAdminContext(id: string): Promise<AdminContext | null> {
  const admin = await findAdminById(id);
  if (!admin) return null;
  const { effective } = await loadPermissionState(admin.id, admin.role_key);
  return { ...admin, permissions: effective };
}
