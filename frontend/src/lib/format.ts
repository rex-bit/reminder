import type { Reminder, ReminderContent } from '../api/types';

const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/** "2026-11-09" -> "Senin, 9 November 2026" (calendar math only, no timezone shift). */
export function longDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAYS_ID[dow]}, ${d} ${MONTHS_ID[m - 1]} ${y}`;
}

/**
 * Local preview of the outgoing message. The backend/bot builds the final text from the same
 * fields; if `custom_message` is set it is sent exactly as written.
 */
export function buildMessage(r: Pick<Reminder, 'title' | 'kind' | 'reminder_date' | 'custom_message'> & { content: ReminderContent }): string {
  if (r.custom_message && r.custom_message.trim()) return r.custom_message;
  const c = r.content;
  const out: string[] = [];
  out.push(r.kind === 'emergency' ? `🚨 *PENGUMUMAN DARURAT*` : `📌 *${r.title || 'Pengingat'}*`);
  if (r.kind === 'emergency' && r.title) out.push(`*${r.title}*`);
  out.push(`🗓️ ${longDate(r.reminder_date)}`);
  if (c.uniform.trim()) out.push('', `👕 *Seragam*`, c.uniform.trim());
  if (c.subjects.length) {
    out.push('', `📚 *Jadwal Pelajaran*`);
    c.subjects.forEach((s, i) => out.push(`${i + 1}. ${[s.time, s.subject, s.teacher ? `(${s.teacher})` : ''].filter(Boolean).join(' ')}`));
  }
  if (c.homework.length) {
    out.push('', `📝 *PR / Tugas*`);
    c.homework.forEach((h) => out.push(`• ${h.subject}: ${h.task}${h.due ? ` (kumpul ${h.due})` : ''}`));
  }
  if (c.piket.length) {
    out.push('', `🧹 *Piket*`);
    c.piket.forEach((p) => out.push(`• ${p.name}${p.area ? ` - ${p.area}` : ''}`));
  }
  if (c.notes.trim()) out.push('', `🗒️ *Catatan*`, c.notes.trim());
  if (c.announcements.trim()) out.push('', `📢 *Pengumuman*`, c.announcements.trim());
  return out.join('\n');
}

export function manualShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function fmtDateTime(iso: string | null | undefined, tz?: string): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function todayIso(tz?: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
}

/** Converts a wall-clock date+time in `tz` to a UTC ISO string. */
export function zonedToIso(date: string, time: string, tz: string): string {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return new Date(guess - (asUtc - guess)).toISOString();
}

/** Splits a UTC ISO string into wall-clock date/time in `tz`. */
export function isoToZoned(iso: string, tz: string): { date: string; time: string } {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const p = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export const TIMEZONES = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone');
  } catch {
    return ['UTC', 'Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'Asia/Kuala_Lumpur', 'Asia/Singapore'];
  }
})();
