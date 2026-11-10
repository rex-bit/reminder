# Metode pengiriman: WhatsApp otomatis dan push website

Setiap reminder punya satu pilihan metode di form: **WhatsApp otomatis**, **Push website**, atau **Keduanya**.
Tidak ada metode lain. (Penerima "kirim manual" dari versi lama tetap tersimpan, tapi tidak muncul sebagai pilihan baru.)

## Apa yang terjadi saat waktu jadwal tiba
- **Push website:** notifikasi dikirim ke semua perangkat admin (izin `reminders.read`) dan, bila halaman publik aktif, ke semua perangkat siswa yang mengaktifkan notifikasi. Hasilnya dicatat di `push_deliveries` (jumlah perangkat berhasil/gagal) dan tampil di halaman reminder. Ketuk notifikasi membuka reminder.
- **WhatsApp otomatis:** satu pesan per penerima lewat WhatsApp Business Cloud API. Status Scheduled, Sent, Delivered, Read, Failed diperbarui lewat webhook Meta.
- **Anti-duplikat:** push dijaga `UNIQUE(reminder_id, run_key)`; WhatsApp dijaga `delivery_logs.idempotency_key` dan hanya dikirim selama status `queued`. Jika respons Meta hilang (timeout), pesan **tidak** dikirim ulang otomatis (statusnya `delivery_unknown`); cek dulu, lalu pakai "Retry failed".
- **Retry:** error sementara (rate limit, 5xx, jaringan putus sebelum terkirim) dicoba ulang otomatis dengan backoff, maksimal `DELIVERY_MAX_ATTEMPTS`.

## Yang harus kamu siapkan untuk WhatsApp (belum bisa dites tanpa ini)
1. Akun **Meta Business** + app di developers.facebook.com dengan produk **WhatsApp**.
2. Nomor telepon WhatsApp Business yang terdaftar. Catat **Phone number ID**.
3. **Access token permanen** (System User di Business Settings, izin `whatsapp_business_messaging`).
4. **Template pesan** disetujui Meta, kategori Utility, dengan **satu variabel** di body, mis. `{{1}}`. Template wajib untuk mengirim di luar jendela 24 jam. Tanpa template, pesan bebas hanya sampai ke orang yang membalas nomormu dalam 24 jam terakhir.
5. **Webhook** di Meta: Callback URL `https://api.classreminder.my.id/api/v1/webhooks/whatsapp`, Verify token = isi `WHATSAPP_VERIFY_TOKEN`, subscribe field `messages`. **App Secret** (App settings → Basic) ke `WHATSAPP_APP_SECRET`.
6. Penerima: nomor format E.164 (`+62...`). Grup tidak didukung untuk kirim otomatis.

Isi di `.env` server Pterodactyl (jangan di chat/repo): `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANG`, `WHATSAPP_VERIFY_TOKEN` (min 16 karakter, acak), `WHATSAPP_APP_SECRET`. Lalu restart server. Migrasi baru: jalankan `node dist/db/migrate.js` (atau perintah setup yang sama seperti sebelumnya).

Selama kredensial kosong, form menampilkan peringatan dan pengiriman WhatsApp berstatus Failed dengan pesan `whatsapp_not_configured` yang menyebut variabel apa yang kurang. Tidak ada yang pura-pura terkirim.

## Push website
Perlu `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (sudah ada di panduan deploy). Pengguna menyalakan/mematikan notifikasi dari tombol di aplikasi (admin: Profil/Pengaturan; siswa: halaman utama). iPhone perlu "Add to Home Screen" dulu.
