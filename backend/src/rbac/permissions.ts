/** Single source of truth for permission keys. `npm run seed` syncs these into the DB. */
export interface PermissionDef {
  key: string;
  category: string;
  description: string;
}

export const PERMISSIONS: readonly PermissionDef[] = [
  { key: 'reminders.read', category: 'Reminders', description: 'View reminders, history and previews' },
  { key: 'reminders.create', category: 'Reminders', description: 'Create, duplicate and save drafts' },
  { key: 'reminders.update', category: 'Reminders', description: 'Edit reminders' },
  { key: 'reminders.delete', category: 'Reminders', description: 'Delete reminders' },
  { key: 'reminders.send', category: 'Reminders', description: 'Send now, retry failed, emergency announcements' },
  { key: 'schedule.manage', category: 'Scheduling', description: 'Schedule, reschedule and cancel reminders' },
  { key: 'templates.read', category: 'Templates', description: 'View reminder templates' },
  { key: 'templates.manage', category: 'Templates', description: 'Create, edit and delete templates' },
  { key: 'recipients.read', category: 'Recipients', description: 'View recipients' },
  { key: 'recipients.manage', category: 'Recipients', description: 'Create, edit and delete recipients' },
  { key: 'logs.delivery', category: 'Logs', description: 'View delivery logs' },
  { key: 'logs.activity', category: 'Logs', description: 'View activity (audit) logs' },
  { key: 'admins.read', category: 'Admins', description: 'View admin accounts' },
  { key: 'admins.create', category: 'Admins', description: 'Add admin accounts' },
  { key: 'admins.update', category: 'Admins', description: 'Edit admins, disable accounts, reset passwords' },
  { key: 'admins.delete', category: 'Admins', description: 'Remove admin accounts' },
  { key: 'admins.permissions', category: 'Admins', description: 'Change other admins\' permissions' },
  { key: 'settings.read', category: 'Settings', description: 'View application settings' },
  { key: 'settings.update', category: 'Settings', description: 'Change application settings' },
] as const;

export const ALL_PERMISSION_KEYS: readonly string[] = PERMISSIONS.map((p) => p.key);

/** Default permissions of the `admin` role. The Owner can grant or revoke more per admin. */
export const DEFAULT_ADMIN_PERMISSIONS: readonly string[] = [
  'reminders.read',
  'reminders.create',
  'reminders.update',
  'reminders.send',
  'schedule.manage',
  'templates.read',
  'recipients.read',
  'logs.delivery',
];

export const ROLE_OWNER = 'owner';
export const ROLE_ADMIN = 'admin';

export interface PermissionOverride {
  key: string;
  granted: boolean;
}

/** Effective permissions: Owner => everything; otherwise role defaults with per-admin overrides applied. */
export function resolvePermissions(
  roleKey: string,
  rolePermissions: readonly string[],
  overrides: readonly PermissionOverride[],
): Set<string> {
  if (roleKey === ROLE_OWNER) return new Set(ALL_PERMISSION_KEYS);
  const result = new Set(rolePermissions);
  for (const o of overrides) {
    if (o.granted) result.add(o.key);
    else result.delete(o.key);
  }
  return result;
}
