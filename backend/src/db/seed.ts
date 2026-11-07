import { env } from '../config/env';
import { hashPassword } from '../security/password';
import { pool, withTx } from './pool';
import { ALL_PERMISSION_KEYS, DEFAULT_ADMIN_PERMISSIONS, PERMISSIONS, ROLE_OWNER } from '../rbac/permissions';

const ADMIN_ROLE_ID = 2;
const OWNER_ROLE_ID = 1;

export async function seed(): Promise<void> {
  await withTx(async (db) => {
    // 1. Permissions (idempotent upsert, stale keys removed).
    for (const p of PERMISSIONS) {
      await db.query(
        `INSERT INTO permissions (key, category, description) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET category = EXCLUDED.category, description = EXCLUDED.description`,
        [p.key, p.category, p.description],
      );
    }
    await db.query('DELETE FROM permissions WHERE NOT (key = ANY($1::text[]))', [ALL_PERMISSION_KEYS]);

    // 2. Default permissions of the `admin` role. Owner is implicit (all), so it has no rows.
    await db.query('DELETE FROM role_permissions WHERE role_id = $1', [ADMIN_ROLE_ID]);
    await db.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, id FROM permissions WHERE key = ANY($2::text[])`,
      [ADMIN_ROLE_ID, DEFAULT_ADMIN_PERMISSIONS],
    );

    // 3. Default application settings (never overwritten once set).
    const defaults: Array<[string, unknown, string]> = [
      ['app.timezone', env.DEFAULT_TIMEZONE, 'Default IANA timezone for scheduling'],
      ['app.name', 'Reminder', 'Display name of the application'],
      ['reminder.default_send_time', '06:00', 'Default send time (HH:mm) in the app timezone'],
      ['whatsapp.groups_supported', false, 'Whether the business number is eligible for the WhatsApp Groups API (verify with Meta first)'],
      ['delivery.max_attempts', 5, 'Maximum delivery attempts per recipient'],
    ];
    for (const [key, value, description] of defaults) {
      await db.query(
        `INSERT INTO app_settings (key, value, description) VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (key) DO NOTHING`,
        [key, JSON.stringify(value), description],
      );
    }

    // 4. First Owner account.
    const existing = await db.query('SELECT 1 FROM admins WHERE role_id = $1 AND deleted_at IS NULL', [OWNER_ROLE_ID]);
    if (existing.rowCount === 0) {
      if (!env.OWNER_EMAIL || !env.OWNER_PASSWORD) {
        throw new Error('No Owner exists yet: set OWNER_EMAIL and OWNER_PASSWORD (and optionally OWNER_USERNAME) in .env');
      }
      const hash = await hashPassword(env.OWNER_PASSWORD);
      const res = await db.query<{ admin_code: string }>(
        `INSERT INTO admins (username, email, display_name, password_hash, role_id, must_change_password)
         VALUES ($1, $2, $3, $4, $5, true) RETURNING admin_code`,
        [env.OWNER_USERNAME ?? 'owner', env.OWNER_EMAIL, 'Owner', hash, OWNER_ROLE_ID],
      );
      await db.query(
        `INSERT INTO activity_logs (action, entity_type, entity_id, metadata)
         VALUES ('admin.seed_owner', 'admin', $1, '{}'::jsonb)`,
        [res.rows[0]?.admin_code ?? null],
      );
      console.log(`created ${ROLE_OWNER} account ${res.rows[0]?.admin_code} (password change required on first login)`);
    } else {
      console.log('owner already exists, skipped');
    }
  });
  console.log('seed complete');
}

if (require.main === module) {
  seed()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
