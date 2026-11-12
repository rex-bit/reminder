import { InfoPage } from '../ui/InfoPage';
import { Icon, type IconName } from '../ui/Icon';

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'list', title: 'Reminder Management', text: 'Buat, ubah, duplikat, dan cari reminder harian maupun pengumuman darurat dalam satu tempat.' },
  { icon: 'schedule', title: 'Class Schedule', text: 'Jadwal pelajaran, tugas, dan piket tersusun rapi di setiap reminder.' },
  { icon: 'send', title: 'WhatsApp Integration', text: 'Bagikan ke WhatsApp dengan satu ketukan. Pengiriman otomatis lewat WhatsApp Cloud API tersedia setelah dikonfigurasi pengelola.' },
  { icon: 'refresh', title: 'Automatic Scheduling', text: 'Atur waktu kirim, termasuk reminder berulang harian, mingguan, atau bulanan.' },
  { icon: 'campaign', title: 'Notification System', text: 'Siswa bisa mengaktifkan notifikasi di browser untuk tahu saat reminder baru dirilis.' },
  { icon: 'template', title: 'Template Management', text: 'Simpan susunan standar agar reminder berikutnya cukup disesuaikan.' },
  { icon: 'history', title: 'Reminder History', text: 'Riwayat reminder dan log pengiriman, bisa diekspor sebagai CSV.' },
];

const MISSION = [
  'Mempermudah penyampaian informasi kelas.',
  'Membantu pengelolaan jadwal pelajaran.',
  'Mengelola pengingat tugas dan kegiatan.',
  'Mempermudah distribusi informasi melalui WhatsApp.',
  'Membantu pengelolaan reminder secara lebih terstruktur.',
];

export function AboutPage() {
  return (
    <InfoPage title="Tentang Class Reminder" description="Class Reminder membantu kelas menyusun dan menyampaikan jadwal, tugas, serta pengingat kegiatan secara rapi." icon="campaign">
      <section className="info-sec">
        <h2 className="title-l">Apa itu Class Reminder?</h2>
        <p className="body-m">Class Reminder adalah aplikasi web untuk mengelola pengingat kelas: jadwal pelajaran, tugas, jadwal piket, dan pengumuman. Admin menyusun reminder di panel, lalu membagikannya ke WhatsApp. Siswa dapat membuka halaman Info Kelas kapan saja tanpa perlu akun.</p>
        <h3 className="title-m">Mengapa dibuat?</h3>
        <p className="body-m">Informasi kelas sering tersebar di banyak pesan, mudah tertimpa obrolan lain, dan ditulis ulang setiap hari. Class Reminder dibuat agar informasi itu ditulis sekali dengan format yang konsisten dan mudah ditemukan kembali.</p>
        <h3 className="title-m">Masalah yang ingin diselesaikan</h3>
        <ul className="body-m">
          <li>Jadwal dan tugas terlewat karena tenggelam di grup chat.</li>
          <li>Pesan harian harus diketik ulang dengan format yang berbeda-beda.</li>
          <li>Tidak ada catatan yang rapi tentang apa saja yang sudah dikirim.</li>
        </ul>
      </section>

      <section className="info-sec">
        <h2 className="title-l">Our Purpose</h2>
        <p className="body-m">Membantu pengelolaan informasi dan pengingat kegiatan kelas agar setiap siswa tahu apa yang perlu dibawa, dikerjakan, dan dipersiapkan, sementara pengurus kelas menghemat waktu menyusunnya.</p>
      </section>

      <div className="info-two">
        <section className="info-sec card outlined">
          <h2 className="title-l">Vision</h2>
          <p className="body-m">Menjadi alat sederhana yang membuat informasi kelas selalu jelas, tepat waktu, dan mudah dijangkau semua orang di kelas.</p>
        </section>
        <section className="info-sec card outlined">
          <h2 className="title-l">Mission</h2>
          <ul className="body-m">{MISSION.map((m) => <li key={m}>{m}</li>)}</ul>
        </section>
      </div>

      <section className="info-sec">
        <h2 className="title-l">Key Features</h2>
        <div className="info-grid">
          {FEATURES.map((f) => (
            <article key={f.title} className="card outlined info-feat">
              <span className="info-ico sm" aria-hidden="true"><Icon name={f.icon} size={22} /></span>
              <h3 className="title-m">{f.title}</h3>
              <p className="body-s muted">{f.text}</p>
            </article>
          ))}
        </div>
      </section>
    </InfoPage>
  );
}
