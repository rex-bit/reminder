import webpush from 'web-push';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { query } from '../../db/pool';
import { loadPermissionState } from '../admins/admins.repo';

export const pushEnabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
if (pushEnabled) webpush.setVapidDetails(env.VAPID_SUBJECT!, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);

export interface PushPayload {
  title: string;
  body: string;
  reminderId?: string;
  /** In-app route (without '#/') opened on tap, e.g. 'home'. Defaults to the reminder or "To send" page. */
  path?: string;
  tag?: string;
}

type SubTable = 'push_subscriptions' | 'public_push_subscriptions';

interface Sub {
  id: string;
  admin_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function deliver(sub: Sub, payload: PushPayload, table: SubTable = 'push_subscriptions'): Promise<boolean> {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'high' });
    await query(`UPDATE ${table} SET last_success_at = now(), last_error = NULL WHERE id = $1`, [sub.id]);
    return true;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      // The browser uninstalled/revoked this subscription.
      await query(`DELETE FROM ${table} WHERE id = $1`, [sub.id]);
    } else {
      await query(`UPDATE ${table} SET last_error = $2 WHERE id = $1`, [sub.id, String((err as Error).message).slice(0, 300)]);
      logger.warn({ status, subId: sub.id }, 'push delivery failed');
    }
    return false;
  }
}

/** Sends to every device of every active admin who holds `permission` (Owner included). Returns how many devices accepted it. */
export async function notifyAdmins(permission: string, payload: PushPayload): Promise<number> {
  if (!pushEnabled) return 0;
  const rows = await query<Sub & { role_key: string }>(
    `SELECT s.id, s.admin_id, s.endpoint, s.p256dh, s.auth, r.key AS role_key
       FROM push_subscriptions s JOIN admins a ON a.id = s.admin_id JOIN roles r ON r.id = a.role_id
      WHERE a.status = 'active' AND a.deleted_at IS NULL`,
  );
  const allowed = new Map<string, boolean>();
  let ok = 0;
  for (const sub of rows.rows) {
    if (!allowed.has(sub.admin_id)) {
      const st = await loadPermissionState(sub.admin_id, sub.role_key);
      allowed.set(sub.admin_id, st.effective.has(permission));
    }
    if (allowed.get(sub.admin_id) && (await deliver(sub, payload))) ok++;
  }
  return ok;
}

export async function notifyOne(subscriptionOwnerId: string, payload: PushPayload): Promise<number> {
  if (!pushEnabled) return 0;
  const rows = await query<Sub>(`SELECT id, admin_id, endpoint, p256dh, auth FROM push_subscriptions WHERE admin_id = $1`, [subscriptionOwnerId]);
  let ok = 0;
  for (const s of rows.rows) if (await deliver(s, payload)) ok++;
  return ok;
}

/** Sends to every device that enabled notifications on the public page (skips browsers that are also an admin device, so nobody gets it twice). */
export async function notifyPublic(payload: PushPayload): Promise<number> {
  if (!pushEnabled) return 0;
  const rows = await query<Sub>(
    `SELECT p.id, p.endpoint, p.p256dh, p.auth, NULL::uuid AS admin_id
       FROM public_push_subscriptions p
      WHERE NOT EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.endpoint = p.endpoint)`,
  );
  let ok = 0;
  // Small batches keep one slow push service from delaying everyone else.
  for (let i = 0; i < rows.rows.length; i += 20) {
    const results = await Promise.all(rows.rows.slice(i, i + 20).map((s) => deliver(s, payload, 'public_push_subscriptions')));
    ok += results.filter(Boolean).length;
  }
  return ok;
}
