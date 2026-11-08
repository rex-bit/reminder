# Deploy backend ke VPS (Pterodactyl) + Vercel

Panduan khusus untuk setup ini:

```
Browser ──► Vercel (frontend, HTTPS)
               │  VITE_API_URL=https://api.classreminder.my.id/api/v1
               ▼
        Nginx di VPS (HTTPS, Let's Encrypt)   api.classreminder.my.id
               │  proxy ke 127.0.0.1:<PORT>
               ▼
        Pterodactyl server "reminder-api" (Node.js 22)  ── API + delivery worker
               │                         │
               ▼                         ▼
        Neon PostgreSQL (SSL)     Redis Docker terpisah (bind ke gateway Docker, bukan internet)
```

**Prinsip:** tidak ada yang mengubah panel, Wings, MariaDB, atau Redis milik Pterodactyl. Semua yang baru adalah file/kontainer terpisah dan bisa dihapus tanpa efek ke panel (lihat [Rollback](#10-rollback)).

> Jangan pernah menaruh password/secret asli di repo atau dokumen ini. Semua nilai `<...>` di bawah adalah placeholder. Secret hanya ada di file `.env` di server Pterodactyl dan di password manager kamu.

Isi:
1. [Persiapan & keputusan domain](#1-persiapan--keputusan-domain)
2. [DNS di Domainesia](#2-dns-di-domainesia)
3. [PostgreSQL di Neon](#3-postgresql-di-neon)
4. [Redis terisolasi (Docker)](#4-redis-terisolasi-docker)
5. [Server Pterodactyl](#5-server-pterodactyl)
6. [Environment variables](#6-environment-variables)
7. [Nginx + SSL (Certbot)](#7-nginx--ssl-certbot)
8. [Vercel](#8-vercel)
9. [Pengujian](#9-pengujian)
10. [Rollback](#10-rollback)
11. [Troubleshooting](#11-troubleshooting)
12. [Lampiran: Postgres di VPS (alternatif Neon)](#12-lampiran-postgres-di-vps-alternatif-neon)

---

## 1. Persiapan & keputusan domain

Yang dibutuhkan backend (dari kode): Node ≥ 20 (Node 22 di egg cukup), **PostgreSQL** (MariaDB tidak bisa), **Redis** (antrean BullMQ, wajib `noeviction`), tanpa WebSocket. Bot WhatsApp **tidak dipakai**: biarkan `BOT_SERVICE_URL` dan `BOT_API_KEY` kosong (pengingat dikirim lewat notifikasi + bagikan manual).

Pilih satu pola frontend, ini menentukan cookie dan CORS:

| | A. Frontend tetap `*.vercel.app` | B. Frontend di `classreminder.my.id` (disarankan) |
|---|---|---|
| `CORS_ORIGINS` | `https://reminders-class.vercel.app` | `https://classreminder.my.id` (tambahkan `https://www.classreminder.my.id` bila dipakai) |
| `COOKIE_SAMESITE` | `none` | `lax` |
| `COOKIE_SECURE` | `true` | `true` |
| Login admin di iPhone/Safari | bisa gagal (cookie lintas situs diblokir) | aman (satu situs: `classreminder.my.id` dan `api.classreminder.my.id`) |

Selama masa peralihan boleh mengisi keduanya di `CORS_ORIGINS`, dipisah koma, **tanpa spasi akhir dan tanpa `/` di belakang**. Selama `*.vercel.app` masih dipakai, biarkan `COOKIE_SAMESITE=none`.

Backend memeriksa origin persis sama (`env.CORS_ORIGINS.includes(origin)`), jadi `https://classreminder.my.id` dan `https://www.classreminder.my.id` dihitung berbeda. URL preview Vercel (`...-git-...vercel.app`) tidak otomatis diizinkan.

## 2. DNS di Domainesia

1. Domainesia → Domain → `classreminder.my.id` → **Kelola DNS** (pastikan nameserver domain memang milik Domainesia).
2. Tambahkan record:
   - Tipe `A`, Host `api`, Value `188.166.177.117`, TTL 300 (atau terkecil yang tersedia).
3. Untuk pola B, di Vercel buka **Settings → Domains → Add** `classreminder.my.id`. Vercel menampilkan record yang harus ditambahkan; salin persis dari sana ke Domainesia.
4. Cek dari VPS atau laptop:
   ```bash
   dig +short api.classreminder.my.id      # harus 188.166.177.117
   ```
   Kalau belum muncul, tunggu propagasi. Jangan lanjut ke langkah 7 sebelum benar.

## 3. PostgreSQL di Neon

1. neon.tech → buat project, region **Asia Pacific (Singapore)**, Postgres versi terbaru yang ditawarkan.
2. Buka **Connection details**. Pilih koneksi **langsung (non-pooler)**, lalu salin connection string. Bentuknya `postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require`. Ini yang menjadi `DATABASE_URL`.
3. Set `DATABASE_SSL=true`.
4. **Perhatikan jatah gratis.** Backend mengecek jadwal setiap 60 detik, jadi database Neon tidak pernah tidur. Cek di dashboard Neon apakah jatah jam compute gratis cukup untuk aktif 24 jam sehari. Kalau tidak, pakai [Lampiran 12](#12-lampiran-postgres-di-vps-alternatif-neon).

## 4. Redis terisolasi (Docker)

Jangan pakai Redis milik panel. Pasang Redis baru dalam kontainer, dengan kebijakan `noeviction`, password, dan hanya mendengarkan di alamat gateway Docker (bukan di IP publik).

### 4.1 Cek jaringan Docker yang dipakai Wings (jangan hardcode)

```bash
# nama jaringan dan interface yang dipakai Wings
sudo grep -A8 '^  network:' /etc/pterodactyl/config.yml
sudo docker network ls

# ambil subnet dan gateway dari jaringan itu (default nama: pterodactyl_nw)
NET=pterodactyl_nw
SUBNET=$(sudo docker network inspect "$NET" --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}')
GW=$(sudo docker network inspect "$NET" --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}')
echo "net=$NET subnet=$SUBNET gateway=$GW"
```

Kalau `config.yml` memakai nama jaringan lain, ganti `NET`. Catat nilai `GW`. Dalam panduan ini ditulis `<GATEWAY>`.

### 4.2 Jalankan Redis

```bash
REDIS_PASS=$(openssl rand -hex 24)
echo "$REDIS_PASS"        # simpan di password manager SEKARANG, jangan di repo

sudo docker run -d --name reminder-redis --restart unless-stopped \
  -p "$GW:6390:6379" \
  -v reminder-redis-data:/data \
  --memory 256m \
  redis:7-alpine \
  redis-server --requirepass "$REDIS_PASS" --maxmemory-policy noeviction --appendonly yes
```

- `-p "$GW:6390:6379"` membuat Redis hanya terbuka di IP gateway, tidak di `188.166.177.117`.
- Password memakai hex supaya aman ditaruh di URL tanpa escaping.
- Port `6390` dipilih agar tidak bentrok dengan Redis panel (`6379`).

### 4.3 Firewall (kalau ufw aktif)

```bash
sudo ufw status
# bila aktif, izinkan HANYA subnet Docker ke gateway:6390
sudo ufw allow from "$SUBNET" to "$GW" port 6390 proto tcp
```

### 4.4 Verifikasi

```bash
# 1) hanya mendengarkan di gateway, bukan 0.0.0.0 / IP publik
sudo ss -tlnp | grep 6390

# 2) konektivitas dari dalam jaringan yang sama dengan server Pterodactyl
sudo docker run --rm --network "$NET" redis:7-alpine \
  redis-cli -h "$GW" -p 6390 -a "$REDIS_PASS" --no-auth-warning ping            # PONG
sudo docker run --rm --network "$NET" redis:7-alpine \
  redis-cli -h "$GW" -p 6390 -a "$REDIS_PASS" --no-auth-warning config get maxmemory-policy   # noeviction

# 3) dari luar (laptop kamu) harus GAGAL / timeout
nc -zv -w 3 188.166.177.117 6390
```

`REDIS_URL` untuk backend: `redis://:<REDIS_PASS>@<GATEWAY>:6390`.

## 5. Server Pterodactyl

### 5.1 Allocation (hanya lokal)
Panel → **Admin → Nodes → Singapore-01 → Allocation**: tambahkan IP `127.0.0.1`, port `4000` (pilih port lain bila terpakai; contoh di bawah memakai 4000).
Port yang dipublikasikan Docker **melewati ufw**. Dengan IP `127.0.0.1`, port API tidak pernah terbuka ke internet; hanya Nginx di VPS yang bisa mengaksesnya.

### 5.2 Buat server
**Admin → Servers → Create New**:
- Egg: **Node.js Generic**, Node.js 22.
- Allocation: `127.0.0.1:4000`.
- Memory: **1536 MiB** (awal 1024–2048 MiB; `npm install` dan `tsc` butuh lebih dari proses harian), Swap 0, CPU 100–200 %, Disk ≥ 5120 MB.
- Biarkan variabel egg di nilai bawaan. Nonaktifkan auto-update dari Git bila ada.

### 5.3 Upload kode
Repo bersifat private dan `backend` adalah subfolder, jadi unggah file langsung:

```bash
# di Codespaces/laptop, setelah semua perubahan di-commit
cd /workspaces/reminder
git archive --format=zip -o reminder-backend.zip HEAD:backend
```

Unduh `reminder-backend.zip`, lalu di panel **Files → Upload** dan **Unarchive** langsung di folder root server (`package.json` harus berada di root, bukan di subfolder). `node_modules` dan `.env` tidak ikut karena tidak ada di git.

### 5.4 File `.env`
Di **Files → New File** buat `.env` (isi dari [bagian 6](#6-environment-variables)). File ini hanya ada di server ini.

Server hanya perlu `PORT` sama dengan port allocation (`4000`) dan `HOST=0.0.0.0`. Backend mengikat `HOST`/`PORT` lewat `app.listen(env.PORT, env.HOST)`; di dalam kontainer harus `0.0.0.0`, kalau `127.0.0.1` Docker tidak bisa meneruskan koneksi masuk.

### 5.5 Setup satu kali (instalasi, build, migrasi, seed Owner)
Perintah ini **bukan** untuk start harian. Di tab **Startup**, ganti **Startup Command** sementara menjadi:

```
npm install --include=dev && npm run build && npm run migrate:prod && npm run seed:prod
```

Tekan **Start** dan perhatikan console. Proses akan selesai sendiri dan server kembali offline. Hasil yang diharapkan:
- `npm run build` tanpa error TypeScript (kode ini belum pernah dikompilasi dengan type asli; kalau ada error, kirim pesannya).
- migrasi: `applied 001_init.sql`, `002_...`, `003_...`.
- seed: `created owner account ...`.

Catatan:
- Tidak ada `package-lock.json` di repo, jadi pakai `npm install`, bukan `npm ci`.
- `--include=dev` wajib karena TypeScript ada di devDependencies.
- `seed:prod` hanya membuat Owner bila belum ada, tetapi juga **mengembalikan izin bawaan role admin** ke default. Jalankan hanya pada setup pertama atau setelah menambah permission baru, bukan di setiap update.

Setelah seed berhasil: **hapus baris `OWNER_PASSWORD` dari `.env`** dan login lalu ganti password Owner (aplikasi memaksanya).

### 5.6 Perintah start harian
Kembalikan **Startup Command** ke:

```
node dist/server.js
```

Tekan **Start**. Log yang benar:
```
"msg":"API listening","host":"0.0.0.0","port":4000
"msg":"delivery worker started"
```
Tidak boleh ada baris `redis error` berulang.

### 5.7 Update kode berikutnya
1. Buat zip baru (5.3) dan unggah, timpa file lama (jangan hapus `.env`).
2. Set Startup Command sementara: `npm install --include=dev && npm run build && npm run migrate:prod`.
3. Start, tunggu selesai, kembalikan ke `node dist/server.js`, Start.

## 6. Environment variables

Isi `.env` di server Pterodactyl. Semua `<...>` diisi sendiri.

```ini
NODE_ENV=production
PORT=4000
HOST=0.0.0.0
LOG_LEVEL=info
TRUST_PROXY=1

# Neon (bagian 3)
DATABASE_URL=<connection string Neon, non-pooler>
DATABASE_SSL=true

# Redis (bagian 4)
REDIS_URL=redis://:<REDIS_PASS>@<GATEWAY>:6390
RUN_WORKER=true
DELIVERY_MAX_ATTEMPTS=5

# Auth: openssl rand -base64 48  (minimal 32 karakter)
JWT_ACCESS_SECRET=<acak panjang>
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_DAYS=14

# CORS & cookie (lihat tabel di bagian 1)
CORS_ORIGINS=https://reminders-class.vercel.app
COOKIE_SECURE=true
COOKIE_SAMESITE=none
COOKIE_DOMAIN=

DEFAULT_TIMEZONE=Asia/Kuala_Lumpur

# Owner awal, hanya dipakai oleh seed (hapus OWNER_PASSWORD setelah seed)
OWNER_USERNAME=owner
OWNER_EMAIL=<email pilihanmu>
OWNER_PASSWORD=<12-72 karakter>

# Notifikasi: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=<public key>
VAPID_PRIVATE_KEY=<private key>
VAPID_SUBJECT=mailto:<email pilihanmu>

# Bot WhatsApp tidak dipakai
BOT_SERVICE_URL=
BOT_API_KEY=
```

Pastikan:
- `CORS_ORIGINS` mencakup domain frontend yang benar-benar dipakai pengguna (lihat bagian 1). Kalau ada domain yang kurang, browser menolak request dan di console muncul "blocked by CORS policy".
- `COOKIE_DOMAIN` dikosongkan. Cookie host-only di `api.classreminder.my.id` sudah cukup untuk pola A maupun B. Jangan mengisinya dengan URL.
- Jangan menaruh VAPID private key atau `JWT_ACCESS_SECRET` di repo. Kalau kunci VAPID diganti, semua langganan notifikasi lama tidak berlaku lagi dan pengguna harus mengaktifkan notifikasi ulang.

## 7. Nginx + SSL (Certbot)

Hanya membuat **file baru**; konfigurasi panel tidak disentuh.

### 7.1 Cadangan dan pemeriksaan
```bash
sudo cp -a /etc/nginx /root/nginx-backup-$(date +%F)
sudo nginx -t
sudo mkdir -p /var/www/html
ls /etc/nginx/sites-enabled/        # lihat site yang sudah ada
```

### 7.2 Tahap 1: HTTP saja (untuk verifikasi domain)
```bash
sudo tee /etc/nginx/sites-available/api.classreminder.my.id.conf >/dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name api.classreminder.my.id;

    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://$host$request_uri; }
}
EOF
sudo ln -s /etc/nginx/sites-available/api.classreminder.my.id.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 7.3 Sertifikat (tanpa mengubah konfigurasi Nginx lain)
```bash
sudo certbot certonly --webroot -w /var/www/html -d api.classreminder.my.id \
  --deploy-hook "systemctl reload nginx"
```

### 7.4 Tahap 2: HTTPS
Ganti isi file tadi dengan:
```bash
sudo tee /etc/nginx/sites-available/api.classreminder.my.id.conf >/dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name api.classreminder.my.id;

    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.classreminder.my.id;

    ssl_certificate     /etc/letsencrypt/live/api.classreminder.my.id/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.classreminder.my.id/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL_reminder_api:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    client_max_body_size 1m;

    # HSTS dan header keamanan lain sudah dikirim backend (helmet).
    location / {
        proxy_pass http://127.0.0.1:4000;     # harus sama dengan allocation Pterodactyl
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $remote_addr;   # bukan $proxy_add_x_forwarded_for: klien tidak bisa memalsukan IP
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }
}
EOF
sudo nginx -t && sudo systemctl reload nginx
```

`TRUST_PROXY=1` di backend cocok dengan satu lapis proxy ini. Kalau suatu saat ada Cloudflare di depan Nginx, ubah menjadi `2` dan sesuaikan header.

### 7.5 Pembaruan sertifikat
```bash
sudo certbot renew --dry-run
systemctl list-timers | grep -i certbot
```

## 8. Vercel

1. **Settings → Environment Variables**: ubah `VITE_API_URL` menjadi
   `https://api.classreminder.my.id/api/v1` (hapus nilai lama dari Codespaces).
2. **Deployments → ⋯ pada deployment teratas → Redeploy**. Variabel `VITE_*` baru terbaca setelah build ulang.
3. Pola B: tambahkan domain `classreminder.my.id` (bagian 2), lalu ubah di backend `.env`: `CORS_ORIGINS=https://classreminder.my.id`, `COOKIE_SAMESITE=lax`, dan restart server Pterodactyl.

## 9. Pengujian

Dari laptop:

```bash
# 1) HTTPS dan database
curl -i https://api.classreminder.my.id/healthz
#   200 {"status":"ok"}   (503 database_unavailable = cek DATABASE_URL / DATABASE_SSL)

# 2) Autentikasi aktif (tanpa token harus 401)
curl -s -o /dev/null -w "%{http_code}\n" https://api.classreminder.my.id/api/v1/reminders

# 3) CORS untuk origin frontend (harus ada access-control-allow-origin = origin tadi)
curl -si https://api.classreminder.my.id/api/v1/reminders \
  -H "Origin: https://reminders-class.vercel.app" | grep -i access-control-allow-origin
#   Ulangi dengan https://classreminder.my.id bila dipakai.
#   Origin yang tidak terdaftar tidak menerima header ini.

# 4) Port API tidak terbuka langsung ke internet (harus gagal)
nc -zv -w 3 188.166.177.117 4000
nc -zv -w 3 188.166.177.117 6390
```

Di VPS:
```bash
sudo ss -tlnp | grep -E ':(4000|6390)'     # 4000 di 127.0.0.1, 6390 di <GATEWAY>
```

Di aplikasi:
1. Buka frontend → login Owner → ganti password.
2. **Settings**: timezone `Asia/Kuala_Lumpur`, aktifkan `public.enabled`.
3. Tambah penerima, buat pengingat, **Mark as sent**. Pengingat muncul di halaman publik.
4. Aktifkan notifikasi di HP (iPhone: Add to Home Screen dulu). Kirim pengingat dan pastikan notifikasi masuk.
5. Console Pterodactyl: tidak ada `redis error` atau `worker error`.

## 10. Rollback

| Masalah | Langkah |
|---|---|
| Frontend rusak setelah ganti `VITE_API_URL` | Vercel → Deployments → deployment lama → **Instant Rollback** (atau kembalikan variabel lalu Redeploy). |
| Backend tidak mau start setelah update kode | Unggah zip versi sebelumnya (git: `git archive ... <commit-lama>:backend`), jalankan setup tanpa seed, lalu start. Migrasi hanya menambah tabel/kolom; jangan mengembalikan skema tanpa cadangan. |
| Nginx bermasalah | `sudo rm /etc/nginx/sites-enabled/api.classreminder.my.id.conf && sudo nginx -t && sudo systemctl reload nginx`. Cadangan penuh ada di `/root/nginx-backup-<tanggal>`. Site panel tidak terpengaruh. |
| Redis bermasalah | `sudo docker stop reminder-redis`. Pengingat yang sudah tersimpan di database tetap ada; scheduler memuat ulang antrean dari tabel `scheduled_jobs` setiap 60 detik setelah Redis hidup lagi. |
| Ingin berhenti total | Stop dan hapus server di panel; `sudo docker rm -f reminder-redis && sudo docker volume rm reminder-redis-data`; hapus file site Nginx dan `sudo certbot delete --cert-name api.classreminder.my.id`; hapus record DNS `api`. Layanan panel tidak berubah. |
| Cadangan sementara | Backend Codespaces tetap bisa dipakai untuk uji coba (lihat `docs/TESTING.md`), tapi tidak untuk penggunaan nyata. |

Cadangan data: Neon menyediakan restore/branch; untuk Postgres di VPS lihat lampiran.

## 11. Troubleshooting

| Gejala | Penyebab umum | Perbaikan |
|---|---|---|
| Console server: `Invalid environment configuration` lalu keluar | Variabel salah/kurang (misal `JWT_ACCESS_SECRET` < 32 karakter, `COOKIE_SECURE` tidak `true` di production, `COOKIE_SAMESITE=none` tanpa `COOKIE_SECURE=true`) | Baca baris `- NAMA: pesan`, perbaiki `.env`, start ulang. |
| `Cannot find module .../dist/server.js` | Build belum jalan atau gagal | Jalankan lagi setup 5.5 dan baca error TypeScript. |
| `npm run build`: `tsc: not found` | devDependencies tidak terpasang | Pakai `npm install --include=dev`. |
| `502 Bad Gateway` dari Nginx | Server Pterodactyl mati, atau port di `proxy_pass` ≠ allocation | Start server; samakan port; cek `sudo ss -tlnp | grep 4000`. |
| Server jalan tapi `curl 127.0.0.1:4000` dari VPS gagal | `HOST=127.0.0.1` atau allocation bukan `127.0.0.1:4000` | Set `HOST=0.0.0.0` dan `PORT` sama dengan allocation. |
| `redis error` berulang, `ECONNREFUSED` | Container Redis mati, `GW` salah, atau ufw memblokir | `sudo docker ps`, cek 4.1 dan 4.3, ulangi tes 4.4. |
| `NOAUTH` / `WRONGPASS` | Password di `REDIS_URL` tidak cocok | Perbaiki `REDIS_URL`, tanpa spasi atau tanda kutip. |
| `healthz` = `database_unavailable` | `DATABASE_URL` salah atau `DATABASE_SSL=false` untuk Neon | Cek string koneksi, set `DATABASE_SSL=true`. |
| Migrasi: `self-signed certificate` / SSL error | Koneksi memakai host/sertifikat yang tidak cocok | Pakai string koneksi resmi Neon (non-pooler), `DATABASE_SSL=true`. |
| Browser: `blocked by CORS policy` | Origin tidak ada di `CORS_ORIGINS` (beda `www`, `http`, atau spasi) | Tambahkan origin persis, restart server, ulangi tes 9.3. |
| Login berhasil tapi kembali ke halaman login | Cookie lintas situs diblokir (pola A di Safari) atau `COOKIE_SECURE`/`SAMESITE` salah | Pakai pola B (domain sendiri, `lax`). |
| Banyak pengguna memicu `rate_limited` bersamaan | `TRUST_PROXY` salah sehingga semua IP terbaca sebagai IP Nginx | `TRUST_PROXY=1` dan header `X-Forwarded-For` seperti di 7.4. |
| Certbot: `Connection refused` / `Timeout` | DNS belum menunjuk ke VPS atau port 80 diblokir | Cek `dig`, `ufw allow 80/tcp`, firewall penyedia VPS. |
| Port 4000 bisa diakses dari internet | Allocation memakai IP publik atau `0.0.0.0` | Buat allocation `127.0.0.1` dan pindahkan server. |
| Notifikasi tidak masuk | VAPID kosong, HP belum subscribe (iPhone belum Add to Home Screen), atau `public.enabled` mati | Cek log `push disabled`, isi VAPID, aktifkan ulang notifikasi. |

## 12. Lampiran: Postgres di VPS (alternatif Neon)

Hanya bila jatah Neon tidak cukup. Sama seperti Redis: kontainer terpisah, tidak menyentuh MariaDB panel.

```bash
PG_PASS=$(openssl rand -hex 24)      # simpan di password manager
sudo docker run -d --name reminder-postgres --restart unless-stopped \
  -e POSTGRES_USER=reminder -e POSTGRES_PASSWORD="$PG_PASS" -e POSTGRES_DB=reminder \
  -p "$GW:5440:5432" -v reminder-pg-data:/var/lib/postgresql/data \
  --memory 512m postgres:16-alpine

sudo ufw allow from "$SUBNET" to "$GW" port 5440 proto tcp   # bila ufw aktif
```

Di `.env`: `DATABASE_URL=postgres://reminder:<PG_PASS>@<GATEWAY>:5440/reminder` dan `DATABASE_SSL=false` (lalu lintas tidak keluar dari VPS).

Cadangan harian (cron root):
```bash
sudo docker exec reminder-postgres pg_dump -U reminder reminder | gzip > /root/backup/reminder-$(date +%F).sql.gz
```
