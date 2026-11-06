import { describe, expect, it } from 'vitest';
import { ALL_PERMISSION_KEYS, DEFAULT_ADMIN_PERMISSIONS, resolvePermissions } from './permissions';

describe('resolvePermissions', () => {
  it('gives the owner every permission regardless of overrides', () => {
    const perms = resolvePermissions('owner', [], [{ key: 'reminders.read', granted: false }]);
    expect([...perms].sort()).toEqual([...ALL_PERMISSION_KEYS].sort());
  });

  it('uses role defaults for admins', () => {
    const perms = resolvePermissions('admin', DEFAULT_ADMIN_PERMISSIONS, []);
    expect(perms.has('reminders.create')).toBe(true);
    expect(perms.has('admins.create')).toBe(false);
  });

  it('applies grants and revokes on top of the role', () => {
    const perms = resolvePermissions('admin', DEFAULT_ADMIN_PERMISSIONS, [
      { key: 'reminders.delete', granted: true },
      { key: 'reminders.send', granted: false },
    ]);
    expect(perms.has('reminders.delete')).toBe(true);
    expect(perms.has('reminders.send')).toBe(false);
  });

  it('default admin permissions are all valid keys', () => {
    for (const k of DEFAULT_ADMIN_PERMISSIONS) expect(ALL_PERMISSION_KEYS).toContain(k);
  });
});
