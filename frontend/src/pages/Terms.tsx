import { InfoPage } from '../ui/InfoPage';

const SECTIONS: { id: string; title: string; body: (string | string[])[] }[] = [
  {
    id: 'introduction',
    title: 'Introduction',
    body: [
      'Dokumen ini menjelaskan aturan penggunaan Class Reminder, yaitu layanan untuk mengelola dan menyampaikan pengingat kegiatan kelas. Layanan dijalankan oleh pengelola situs untuk kebutuhan kelas.',
    ],
  },
  {
    id: 'acceptance',
    title: 'Acceptance of Terms',
    body: ['Dengan membuka halaman publik atau menggunakan panel admin, kamu dianggap telah membaca dan menyetujui syarat ini. Jika tidak setuju, mohon berhenti menggunakan layanan.'],
  },
  {
    id: 'service',
    title: 'Description of Service',
    body: [
      'Class Reminder menyediakan:',
      [
        'Halaman Info Kelas yang dapat dibaca siapa saja tanpa akun, berisi reminder yang sudah dikirim.',
        'Panel admin untuk membuat, menjadwalkan, dan mengirim reminder, mengelola template dan penerima, serta melihat riwayat.',
        'Notifikasi push di browser bagi pengunjung yang mengaktifkannya.',
        'Pengiriman lewat WhatsApp: melalui tautan berbagi manual, atau otomatis lewat WhatsApp Cloud API bila pengelola sudah mengaktifkan dan mengonfigurasinya.',
      ],
      'Fitur dan layanan dapat berubah, ditambah, atau dihentikan sewaktu-waktu. Riwayat perubahan dapat dilihat di halaman Changelog.',
    ],
  },
  {
    id: 'responsibilities',
    title: 'User Responsibilities',
    body: [
      'Pengguna panel admin bertanggung jawab untuk:',
      [
        'Menjaga kerahasiaan username dan kata sandi, serta segera mengganti kata sandi bila dicurigai bocor.',
        'Memastikan isi reminder benar, sopan, dan sesuai dengan kebutuhan kelas.',
        'Hanya memasukkan nomor telepon atau kontak penerima yang berhak dihubungi dan sudah mengetahui bahwa nomornya dipakai untuk menerima reminder.',
        'Mematuhi ketentuan layanan pihak ketiga yang dipakai, misalnya WhatsApp.',
      ],
    ],
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable Use Policy',
    body: ['Layanan hanya boleh dipakai untuk menyampaikan informasi dan pengingat kegiatan kelas, dengan cara yang wajar dan tidak mengganggu pengguna lain maupun sistem.'],
  },
  {
    id: 'prohibited',
    title: 'Prohibited Activities',
    body: [
      'Dilarang untuk:',
      [
        'Mengirim spam, pesan menyesatkan, pelecehan, ancaman, atau konten yang melanggar hukum.',
        'Mengakses panel atau data tanpa izin, mencoba menebak kata sandi, atau menghindari pembatasan keamanan dan batas permintaan.',
        'Mengganggu atau membebani server, misalnya dengan permintaan otomatis berlebihan.',
        'Menyamar sebagai admin atau pihak lain.',
        'Menggunakan layanan untuk tujuan di luar pengelolaan informasi kelas.',
      ],
      'Penyalahgunaan dapat berakibat akun dinonaktifkan atau akses diblokir oleh pengelola.',
    ],
  },
  {
    id: 'account',
    title: 'Account and Access',
    body: [
      'Tidak ada pendaftaran mandiri. Akun admin dibuat oleh Owner, dan izin tiap akun ditentukan oleh Owner. Halaman Info Kelas terbuka untuk umum dan hanya dapat dibaca.',
      'Pengelola dapat mengubah izin, mereset kata sandi, menonaktifkan, atau menghapus akun bila diperlukan demi keamanan atau karena pelanggaran. Akun akan terkunci sementara setelah beberapa kali gagal masuk.',
    ],
  },
  {
    id: 'availability',
    title: 'Service Availability',
    body: [
      'Layanan disediakan sebagaimana adanya dan diusahakan berjalan baik, tetapi tidak ada jaminan selalu aktif atau bebas gangguan. Pemeliharaan, gangguan server, atau gangguan layanan pihak ketiga (misalnya WhatsApp atau layanan push browser) dapat menunda atau menggagalkan pengiriman.',
    ],
  },
  {
    id: 'liability',
    title: 'Limitation of Liability',
    body: [
      'Class Reminder adalah alat bantu. Pengelola tidak menjamin setiap reminder terkirim atau diterima tepat waktu, dan sejauh diizinkan oleh hukum yang berlaku tidak bertanggung jawab atas kerugian akibat pengingat yang terlambat, gagal, atau tidak terbaca. Untuk informasi penting, pastikan juga disampaikan lewat cara lain.',
    ],
  },
  {
    id: 'changes',
    title: 'Changes to Terms',
    body: ['Syarat ini dapat diperbarui. Tanggal pembaruan terbaru tercantum di bagian atas halaman. Dengan tetap menggunakan layanan setelah perubahan, kamu dianggap menyetujui versi terbaru.'],
  },
  {
    id: 'contact',
    title: 'Contact Information',
    body: [
      'Pertanyaan atau laporan penyalahgunaan dapat disampaikan kepada admin kelas atau pengelola situs. Masalah teknis juga dapat dilaporkan lewat repositori proyek di https://github.com/rex-bit/reminder.',
      'Lihat juga Kebijakan Privasi untuk penjelasan tentang data yang disimpan.',
    ],
  },
];

export function TermsPage() {
  return (
    <InfoPage title="Syarat Layanan" description="Aturan penggunaan Class Reminder: tanggung jawab pengguna, larangan, akses akun, dan batasan layanan." icon="receipt" updated="12 November 2026">
      <nav className="info-toc card outlined" aria-label="Daftar isi">
        <h2 className="title-s">Isi halaman</h2>
        <ol>
          {SECTIONS.map((s) => (
            <li key={s.id}><a href={`#/terms#${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{s.title}</a></li>
          ))}
        </ol>
      </nav>
      {SECTIONS.map((s, i) => (
        <section key={s.id} id={s.id} className="info-sec">
          <h2 className="title-l"><span className="info-num">{i + 1}</span>{s.title}</h2>
          {s.body.map((b, k) => (Array.isArray(b) ? <ul key={k} className="body-m">{b.map((x) => <li key={x}>{x}</li>)}</ul> : <p key={k} className="body-m">{b}</p>))}
        </section>
      ))}
    </InfoPage>
  );
}
