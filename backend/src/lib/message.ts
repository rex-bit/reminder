/** Builds the outgoing message text. Kept identical to frontend/src/lib/format.ts so the preview matches what is sent. */
export interface Content {
  uniform?: string;
  subjects?: { time?: string; subject: string; teacher?: string }[];
  homework?: { subject: string; task: string; due?: string }[];
  piket?: { name: string; area?: string }[];
  notes?: string;
  announcements?: string;
}

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d} ${MONTHS[m - 1]} ${y}`;
}

export function buildMessage(r: { title: string; kind: string; reminder_date: string; custom_message: string | null; content: Content }): string {
  if (r.custom_message && r.custom_message.trim()) return r.custom_message;
  const c = r.content ?? {};
  const out: string[] = [];
  if (r.kind === 'emergency') {
    out.push('🚨 *PENGUMUMAN DARURAT*');
    if (r.title) out.push(`*${r.title}*`);
  } else out.push('‼️*REMINDER*‼️');
  out.push(longDate(r.reminder_date));
  if (c.uniform?.trim()) out.push('', '👔*SERAGAM*', c.uniform.trim());
  if (c.subjects?.length) {
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
  if (c.homework?.length) {
    out.push('', '📝*TUGAS*');
    c.homework.forEach((h) => {
      out.push(`• ${h.subject} : ${h.task}`);
      if (h.due) out.push(`*deadline ${h.due}*`);
    });
  }
  if (c.piket?.length) {
    out.push('', '🧹*PIKET*');
    c.piket.forEach((p, i) => out.push(`${i + 1}.${p.name}${p.area ? ` - ${p.area}` : ''}`));
  }
  // Notes and announcements share one section, as in the class's own template.
  const notes = [c.notes?.trim(), c.announcements?.trim()].filter(Boolean);
  if (notes.length) out.push('', '📌*CATATAN*', ...notes);
  return out.join('\n');
}
