/**
 * Roadmap data. Edit this file only; the page (pages/Roadmap.tsx) renders whatever is here.
 * Status reflects the real state of the project. Progress is shown ONLY when `steps` are listed
 * (done / total steps), never as an invented percentage.
 */
export type RoadmapStatus = 'planned' | 'in_progress' | 'completed';

export interface RoadmapStep { label: string; done: boolean }

export interface RoadmapItem {
  id: string;
  area: string;
  title: string;
  description: string;
  status: RoadmapStatus;
  steps?: RoadmapStep[];
  note?: string;
}

export const STATUS_LABEL: Record<RoadmapStatus, string> = { planned: 'Planned', in_progress: 'In Progress', completed: 'Completed' };
export const STATUS_HINT: Record<RoadmapStatus, string> = {
  planned: 'Direncanakan, belum mulai dikerjakan',
  in_progress: 'Sedang dikerjakan',
  completed: 'Selesai dan tersedia',
};

export const ROADMAP: RoadmapItem[] = [
  {
    id: 'whatsapp',
    area: 'WhatsApp Integration',
    title: 'Pengiriman WhatsApp otomatis',
    description: 'Kirim reminder lewat WhatsApp Cloud API resmi, lengkap dengan pelacakan status terkirim, diterima, dan dibaca.',
    status: 'in_progress',
    steps: [
      { label: 'Kode integrasi Cloud API', done: true },
      { label: 'Webhook status pengiriman', done: true },
      { label: 'Akun Meta Business dan nomor pengirim', done: false },
      { label: 'Template pesan disetujui Meta', done: false },
      { label: 'Kredensial diisi di server', done: false },
    ],
    note: 'Kodenya sudah ada; fitur aktif setelah konfigurasi di sisi pengelola selesai. Pengiriman ke grup WhatsApp tidak didukung oleh Cloud API.',
  },
  {
    id: 'pdf',
    area: 'Reminder History',
    title: 'Ekspor PDF',
    description: 'Unduh riwayat reminder sebagai PDF untuk arsip. Saat ini tersedia ekspor CSV.',
    status: 'planned',
  },
  {
    id: 'backup',
    area: 'User & Admin Management',
    title: 'Cadangan database otomatis',
    description: 'Pencadangan Postgres terjadwal agar data aman saat terjadi masalah server.',
    status: 'planned',
  },
  {
    id: 'reminders',
    area: 'Reminder Management',
    title: 'Pengelolaan reminder',
    description: 'Buat, ubah, hapus, duplikat, serta cari dan filter reminder harian maupun pengumuman darurat.',
    status: 'completed',
  },
  {
    id: 'schedule',
    area: 'Automatic Message Scheduling',
    title: 'Penjadwalan otomatis',
    description: 'Jadwalkan waktu kirim; sistem memprosesnya tepat waktu dan mencatat hasilnya.',
    status: 'completed',
  },
  {
    id: 'notif',
    area: 'Notification System',
    title: 'Notifikasi push website',
    description: 'Siswa dapat mengaktifkan notifikasi di halaman Info Kelas dan menerima pemberitahuan saat reminder dirilis.',
    status: 'completed',
  },
  {
    id: 'class',
    area: 'Class Schedule Management',
    title: 'Jadwal pelajaran',
    description: 'Mapel, jam, dan guru pengajar diatur di dalam reminder atau template.',
    status: 'completed',
  },
  {
    id: 'homework',
    area: 'Homework & Assignment Management',
    title: 'Tugas dan PR',
    description: 'Daftar tugas lengkap dengan mapel dan tenggat di setiap reminder.',
    status: 'completed',
  },
  {
    id: 'piket',
    area: 'Duty Roster Management',
    title: 'Jadwal piket',
    description: 'Nama petugas piket dan areanya tercantum pada pesan.',
    status: 'completed',
  },
  {
    id: 'templates',
    area: 'Template Management',
    title: 'Template reminder',
    description: 'Simpan susunan standar dan mulai reminder baru dari template, termasuk template harian bawaan.',
    status: 'completed',
  },
  {
    id: 'history',
    area: 'Reminder History',
    title: 'Riwayat dan log',
    description: 'Riwayat reminder, log pengiriman, dan log aktivitas admin, dengan ekspor CSV.',
    status: 'completed',
  },
  {
    id: 'admins',
    area: 'User & Admin Management',
    title: 'Manajemen admin',
    description: 'Peran Owner/Admin, izin per fitur, reset kata sandi, dan penguncian setelah banyak percobaan gagal.',
    status: 'completed',
  },
  {
    id: 'preview',
    area: 'Message Preview',
    title: 'Pratinjau pesan',
    description: 'Lihat pesan persis seperti yang akan dikirim, dengan opsi menyesuaikan teksnya.',
    status: 'completed',
  },
  {
    id: 'recurring',
    area: 'Recurring Reminders',
    title: 'Reminder berulang',
    description: 'Ulangi reminder harian, mingguan, atau bulanan, dengan batas tanggal akhir.',
    status: 'completed',
  },
];
