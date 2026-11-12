/**
 * Changelog data. Edit this file only; the page (pages/Changelog.tsx) renders whatever is here.
 * Versions group the real development history (see the git log) in Semantic Versioning style; the project is
 * still pre-1.0, so numbers are 0.x. Add a new release at the TOP of the list.
 */
export type ChangeCategory = 'added' | 'improved' | 'fixed' | 'removed';

export interface ChangeEntry {
  category: ChangeCategory;
  title: string;
  description: string;
}

export interface Release {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  description: string;
  changes: ChangeEntry[];
}

export const CATEGORY_LABEL: Record<ChangeCategory, string> = { added: 'Added', improved: 'Improved', fixed: 'Fixed', removed: 'Removed' };
export const CATEGORY_HINT: Record<ChangeCategory, string> = {
  added: 'Fitur baru',
  improved: 'Peningkatan fitur atau pengalaman pengguna',
  fixed: 'Perbaikan bug atau masalah',
  removed: 'Fitur yang dihapus',
};

export const CHANGELOG: Release[] = [
  {
    version: 'v0.5.0',
    date: '2026-11-12',
    title: 'Gestur HP, ekspor, dan halaman informasi',
    description: 'Kemudahan memakai panel admin dari HP, serta halaman informasi publik.',
    changes: [
      { category: 'added', title: 'Geser kartu reminder', description: 'Di HP, geser kartu ke kiri untuk Duplikat atau Hapus.' },
      { category: 'added', title: 'Tarik untuk refresh', description: 'Tarik halaman ke bawah dari atas untuk memuat ulang data.' },
      { category: 'added', title: 'Ekspor CSV', description: 'Daftar reminder dan log pengiriman dapat diunduh sebagai CSV mengikuti filter yang aktif.' },
      { category: 'added', title: 'Halaman Tentang, Syarat Layanan, Changelog, dan Roadmap', description: 'Halaman informasi baru yang bisa dibuka dari footer halaman publik.' },
      { category: 'added', title: 'Pencarian Template dan Penerima', description: 'Kolom cari muncul saat daftar sudah cukup panjang.' },
      { category: 'improved', title: 'Duplikat reminder', description: 'Hasil salinan langsung memakai tanggal hari ini dan judul tanpa awalan "Copy of".' },
      { category: 'improved', title: 'Bar navigasi bawah', description: 'Bar kaca transparan dengan pill yang dapat digeser jari.' },
    ],
  },
  {
    version: 'v0.4.0',
    date: '2026-11-11',
    title: 'Penyegaran tampilan panel admin',
    description: 'Desain ulang panel admin agar lebih nyaman di HP dan layar besar.',
    changes: [
      { category: 'added', title: 'Foto profil admin', description: 'Foto dapat diunggah, digeser, dan di-zoom, serta terlihat oleh semua admin.' },
      { category: 'added', title: 'Template harian bawaan', description: 'Template "Reminder harian kelas" mengikuti format pesan kelas.' },
      { category: 'added', title: 'Ikon aplikasi mengikuti warna tema', description: 'Favicon dan ikon layar utama mengikuti warna aksen yang dipilih.' },
      { category: 'improved', title: 'Dasbor dan daftar reminder', description: 'Kartu status berwarna, daftar berbentuk kartu, dan aksi cepat.' },
      { category: 'improved', title: 'Tabel di HP', description: 'Tabel Penerima, Admin, dan Log kini berbentuk kartu bertumpuk di layar kecil.' },
      { category: 'improved', title: 'Form reminder', description: 'Ikon pada tiap bagian dan pilihan metode pengiriman yang tidak terpotong.' },
      { category: 'fixed', title: 'Penomoran mapel setelah istirahat', description: 'Mapel yang sama setelah istirahat tidak lagi dinomori ulang.' },
    ],
  },
  {
    version: 'v0.3.0',
    date: '2026-11-10',
    title: 'Metode pengiriman dan keamanan',
    description: 'Pilihan cara mengirim reminder dan penguatan keamanan situs.',
    changes: [
      { category: 'added', title: 'Metode pengiriman per reminder', description: 'Pilih WhatsApp otomatis (WhatsApp Cloud API), notifikasi push website, atau keduanya. Pengiriman WhatsApp otomatis baru aktif setelah pengelola mengisi kredensial Meta di server.' },
      { category: 'added', title: 'Kebijakan Privasi dan header keamanan', description: 'Halaman privasi serta CSP, HSTS, dan Permissions-Policy.' },
      { category: 'improved', title: 'Format pesan', description: 'Pesan mengikuti template kelas (REMINDER, SERAGAM, MAPEL, TUGAS, PIKET, CATATAN).' },
    ],
  },
  {
    version: 'v0.2.0',
    date: '2026-11-08',
    title: 'Halaman publik dan bahasa Indonesia',
    description: 'Tampilan halaman Info Kelas dan penyesuaian untuk pengguna Indonesia.',
    changes: [
      { category: 'added', title: 'Pilihan tema dan warna', description: 'Pengunjung dapat memilih mode terang/gelap dan warna aksen.' },
      { category: 'added', title: 'Bahasa Indonesia', description: 'Bahasa Indonesia menjadi bawaan, dengan pengalih bahasa di panel admin.' },
      { category: 'added', title: 'Logo dan ikon aplikasi', description: 'Logo, favicon, dan ikon PWA.' },
      { category: 'improved', title: 'Desain halaman publik', description: 'Desain ulang dengan Material 3: hero, ringkasan, tab, dan kartu darurat.' },
      { category: 'fixed', title: 'Tampilan HP', description: 'Perbaikan latar halaman, baris filter, dan daftar kartu di layar kecil.' },
    ],
  },
  {
    version: 'v0.1.0',
    date: '2026-11-07',
    title: 'Rilis awal',
    description: 'Fondasi sistem: backend, panel admin, dan halaman publik.',
    changes: [
      { category: 'added', title: 'Backend dan manajemen admin', description: 'Login, peran dan izin (RBAC), REST API, dan penjadwal pengiriman.' },
      { category: 'added', title: 'Panel admin Material 3', description: 'Pengelolaan reminder, template, penerima, riwayat, dan log.' },
      { category: 'added', title: 'Alur kirim manual dan Web Push', description: 'Status "Perlu dikirim", notifikasi push, dan dukungan PWA.' },
      { category: 'added', title: 'Halaman Info Kelas', description: 'Halaman publik hanya-baca yang menampilkan reminder yang sudah dikirim.' },
    ],
  },
];
