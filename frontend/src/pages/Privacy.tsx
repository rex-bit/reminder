import { Link } from 'react-router-dom';

export function PrivacyPage() {
  return (
    <div className="auth">
      <article className="card elevated stack" style={{ maxWidth: 680 }}>
        <h1 className="headline-m">Kebijakan Privasi</h1>
        <p className="body-s muted">Terakhir diperbarui: 10 November 2026</p>

        <h2 className="title-m">Data yang disimpan</h2>
        <ul className="body-m">
          <li><b>Pengunjung halaman publik:</b> tidak ada akun. Hanya jika kamu mengaktifkan notifikasi, disimpan alamat langganan push dari browser/perangkatmu (endpoint, kunci enkripsi push, dan jenis browser). Tidak ada nama, email, atau nomor telepon.</li>
          <li><b>Admin:</b> nama, username/email, kata sandi (disimpan hanya dalam bentuk hash, tidak bisa dibaca kembali), serta catatan aktivitas (waktu, alamat IP, jenis browser) untuk keamanan.</li>
          <li><b>Isi pengingat:</b> judul, jadwal, dan isi pesan yang dibuat admin, termasuk nama penerima yang diinput admin.</li>
        </ul>

        <h2 className="title-m">Untuk apa</h2>
        <p className="body-m">Hanya untuk menampilkan pengingat kelas dan mengirim notifikasi. Data tidak dijual, tidak dibagikan untuk iklan, dan tidak dipakai untuk pelacakan.</p>

        <h2 className="title-m">Pihak ketiga</h2>
        <ul className="body-m">
          <li>Layanan push milik browser (Google, Apple, Mozilla) untuk mengantar notifikasi.</li>
          <li>Google Fonts untuk memuat huruf.</li>
          <li>Vercel untuk hosting halaman. Data aplikasi disimpan di server milik pengelola.</li>
          <li>Pesan WhatsApp dikirim manual oleh admin lewat tautan; aplikasi ini tidak mengakses akun WhatsApp.</li>
        </ul>

        <h2 className="title-m">Cookie dan penyimpanan lokal</h2>
        <p className="body-m">Admin memakai cookie sesi untuk tetap login. Pengaturan tampilan (tema, bahasa) disimpan di browser. Tidak ada cookie iklan atau analitik.</p>

        <h2 className="title-m">Hak dan kontrol kamu</h2>
        <ul className="body-m">
          <li>Matikan notifikasi kapan saja lewat tombol di halaman utama; langgananmu akan dihapus.</li>
          <li>Minta data admin atau langganan dihapus dengan menghubungi pengelola.</li>
        </ul>

        <h2 className="title-m">Keamanan</h2>
        <p className="body-m">Koneksi memakai HTTPS, kata sandi di-hash, login dibatasi percobaannya, dan akses data dibatasi per peran. Tidak ada sistem yang 100% aman; laporkan masalah ke pengelola.</p>

        <p className="body-s muted">Kebijakan ini bisa berubah; tanggal pembaruan tertera di atas.</p>
        <Link to="/" className="body-m">← Kembali</Link>
      </article>
    </div>
  );
}
