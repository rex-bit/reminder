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
  out.push(r.kind === 'emergency' ? '🚨 *PENGUMUMAN DARURAT*' : `📌 *${r.title || 'Pengingat'}*`);
  if (r.kind === 'emergency' && r.title) out.push(`*${r.title}*`);
  out.push(`🗓️ ${longDate(r.reminder_date)}`);
  if (c.uniform?.trim()) out.push('', '👕 *Seragam*', c.uniform.trim());
  if (c.subjects?.length) {
    out.push('', '📚 *Jadwal Pelajaran*');
    c.subjects.forEach((s, i) => out.push(`${i + 1}. ${[s.time, s.subject, s.teacher ? `(${s.teacher})` : ''].filter(Boolean).join(' ')}`));
  }
  if (c.homework?.length) {
    out.push('', '📝 *PR / Tugas*');
    c.homework.forEach((h) => out.push(`• ${h.subject}: ${h.task}${h.due ? ` (kumpul ${h.due})` : ''}`));
  }
  if (c.piket?.length) {
    out.push('', '🧹 *Piket*');
    c.piket.forEach((p) => out.push(`• ${p.name}${p.area ? ` - ${p.area}` : ''}`));
  }
  if (c.notes?.trim()) out.push('', '🗒️ *Catatan*', c.notes.trim());
  if (c.announcements?.trim()) out.push('', '📢 *Pengumuman*', c.announcements.trim());
  return out.join('\n');
}
