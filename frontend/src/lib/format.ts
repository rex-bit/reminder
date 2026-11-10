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
  if (r.kind === 'emergency') {
    out.push('🚨 *PENGUMUMAN DARURAT*');
    if (r.title) out.push(`*${r.title}*`);
  } else out.push('‼️*REMINDER*‼️');
  out.push(longDate(r.reminder_date));
  if (c.uniform.trim()) out.push('', '👔*SERAGAM*', c.uniform.trim());
  if (c.subjects.length) {
    out.push('', '📚*MAPEL*');
    let n = 0;
    let prev = '';
    c.subjects.forEach((s) => {
      const time = s.time ? ` (${s.time})` : '';
      const key = s.subject.trim().toLowerCase();
      const teacher = s.teacher ? ` - ${s.teacher}` : '';
      if (/^\s*istirahat\b/i.test(s.subject)) out.push(`${s.subject}${time}`); // breaks are listed but not numbered
      else if (key === prev) out.push(`${s.subject}${teacher}${time}`); // same lesson continuing after a break keeps the earlier number
      else {
        out.push(`${++n}.${s.subject}${teacher}${time}`);
        prev = key;
      }
    });
  }
  if (c.homework.length) {
    out.push('', '📝*TUGAS*');
    c.homework.forEach((h) => {
      out.push(`• ${h.subject} : ${h.task}`);
      if (h.due) out.push(`*deadline ${h.due}*`);
    });
  }
  if (c.piket.length) {
    out.push('', '🧹*PIKET*');
    c.piket.forEach((p, i) => out.push(`${i + 1}.${p.name}${p.area ? ` - ${p.area}` : ''}`));
  }
  // Notes and announcements share one section, as in the class's own template.
  const notes = [c.notes.trim(), c.announcements.trim()].filter(Boolean);
  if (notes.length) out.push('', '📌*CATATAN*', ...notes);
  return out.join('\n');
}

export function manualShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function fmtDateTime(iso: string | null | undefined, tz?: string): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(new Date(iso));
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
