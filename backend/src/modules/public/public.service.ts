import { query } from '../../db/pool';
import { longDate, type Content } from '../../lib/message';
import type { PushPayload } from '../push/push.service';

export async function isPublicEnabled(): Promise<boolean> {
  const r = await query<{ value: unknown }>(`SELECT value FROM app_settings WHERE key = 'public.enabled'`);
  return r.rows[0]?.value === true;
}

export async function appTimezone(): Promise<string> {
  const r = await query<{ value: unknown }>(`SELECT value FROM app_settings WHERE key = 'app.timezone'`);
  return typeof r.rows[0]?.value === 'string' ? (r.rows[0].value as string) : 'UTC';
}

/** What a student sees in the notification: short, no recipients, no internal ids beyond the reminder. */
export function publicNotification(rem: { id: string; title: string; kind: string; reminder_date: string; content: Content }): PushPayload {
  const emergency = rem.kind === 'emergency';
  const text = (rem.content.announcements ?? '').trim().replace(/\s+/g, ' ');
  return {
    title: emergency ? `🚨 ${rem.title}` : `📌 ${rem.title}`,
    body: emergency && text ? text.slice(0, 120) : `${longDate(rem.reminder_date)}. Ketuk untuk melihat jadwal, seragam, dan PR.`,
    path: 'home',
    reminderId: rem.id,
    tag: `public-${rem.id}`,
  };
}
