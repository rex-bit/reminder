# Deploy backend ke VPS (Pterodactyl) + Vercel

Panduan untuk setup ini: VPS Ubuntu 24.04 (`188.166.177.117`), Wings, panel `panel.cuanxuan.my.id`, domain `classreminder.my.id` di DomaiNesia, frontend di Vercel.

```
Browser ──► Vercel (frontend, HTTPS)
               │  VITE_API_URL=https://api.classreminder.my.id/api/v1
               ▼
        Nginx di VPS (HTTPS, Let's Encrypt)       api.classreminder.my.id
               │  proxy_pass http://127.0.0.1:<PORT>
               ▼
        Pterodactyl server "reminder-api" (Node.js 22) ── API + delivery worker
               │                              │
               ▼                              ▼
   PostgreSQL 16 (Docker terpisah)     Redis 7 (Docker terpisah, noeviction)
   keduanya hanya di jaringan Docker, tidak di internet
```

**Prinsip:** Pterodactyl Panel, Wings, MariaDB, Redis panel, dan server bot yang sudah ada **tidak diubah dan tidak dihapus**. Semua yang baru adalah kontainer, volume, file Nginx, dan server baru dengan nama sendiri (`reminder-*`), yang bisa dibuang tanpa efek ke yang lama ([Rollback](#10-rollback)).

> Jangan menaruh password/secret asli di repo atau dokumen ini. Semua `<...>` adalah placeholder. Secret hanya ada di file `.env` server Pterodactyl dan di password manager.

## Status verifikasi (jujur)

| Hal | Status | Bukti |
|---|---|---|
| Backend & frontend lolos `typecheck`, `build`, dan `npm test` dengan dependensi asli (Node 22) | **Terverifikasi** | GitHub Actions `CI` (`.github/workflows/ci.yml`) hijau. CI menemukan 5 error tipe yang sudah diperbaiki. |
| `dist/server.js`, `dist/db/migrate.js`, `dist/db/seed.js` terbentuk setelah build | **Terverifikasi** | langkah terakhir CI |
| Egg Node.js Generic: image `ghcr.io/ptero-eggs/yolks:nodejs_22` tersedia, startup command bawaan, variabel `USER_UPLOAD`/`MAIN_FILE` | **Terverifikasi dari dokumentasi egg**, belum dari panelmu | [eggs.pterodactyl.io](https://eggs.pterodactyl.io/egg/generic-node-js-generic) |
| Neon Free: 100 CU-jam/bulan per project, scale-to-zero 5 menit tidak bisa dimatikan | **Terverifikasi dari dokumentasi Neon** | [neon.com/faqs](https://neon.com/faqs/cheapest-ways-run-postgres-database-low-traffic) |
| Semua perintah Docker, Wings, Redis, Postgres, Nginx, Certbot di VPS | **BELUM diuji** | Belum ada output terminal dari VPS. Jalankan bertahap dan cocokkan dengan "Hasil yang diharapkan". |
| Perilaku Wings v1.13.4 untuk allocation `127.0.0.1` | **BELUM diverifikasi** | Diperiksa dengan perintah di [5.2](#52-allocation-dan-uji-pemetaan-port) sebelum Nginx dipakai. |

Isi:
0. [Inventaris sebelum mengubah apa pun](#0-inventaris-sebelum-mengubah-apa-pun)
1. [Keputusan domain & urutan kerja](#1-keputusan-domain--urutan-kerja)
2. [DNS di DomaiNesia](#2-dns-di-domainesia)
3. [PostgreSQL](#3-postgresql)
4. [Redis terisolasi](#4-redis-terisolasi)
5. [Server Pterodactyl](#5-server-pterodactyl)
6. [Environment variables](#6-environment-variables)
7. [Nginx + SSL (Certbot)](#7-nginx--ssl-certbot)
8. [Vercel](#8-vercel)
9. [Pengujian](#9-pengujian)
10. [Rollback](#10-rollback)
11. [Troubleshooting](#11-troubleshooting)

---

## 0. Inventaris sebelum mengubah apa pun

Semua perintah di bagian ini **hanya membaca**. Simpan hasilnya, supaya ada pembanding kalau perlu rollback.

```bash
sudo mkdir -p /root/reminder-deploy && cd /root/reminder-deploy
{
  date; uname -a; lsb_release -d
  echo "--- port yang sedang dipakai"; ss -tlnp
  echo "--- docker"; docker --version; docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'
  echo "--- jaringan docker"; docker network ls
  echo "--- volume docker"; docker volume ls
  echo "--- daemon.json"; cat /etc/docker/daemon.json 2>/dev/null || echo "(tidak ada)"
  echo "--- nginx"; nginx -v 2>&1; nginx -T 2>/dev/null | grep -nE "server_name|listen|include " | head -80
  echo "--- sertifikat"; certbot certificates 2>/dev/null | grep -E "Certificate Name|Domains|Expiry"
  echo "--- ufw"; ufw status verbose
  echo "--- wings"; systemctl is-active wings; wings --version 2>/dev/null
  echo "--- resource"; free -h; df -h /
} 2>&1 | tee inventory-before.txt
```

Catat dari output:
- port yang **sudah terpakai** (cari `4000`, `6390`, `5440`; ganti port di panduan ini kalau bentrok, termasuk dengan server bot yang sudah ada);
- nama jaringan Docker milik Wings (biasanya `pterodactyl_nw`);
- apakah `daemon.json` mematikan `userland-proxy` (lihat [4.1](#41-cek-jaringan-docker-yang-dipakai-wings-jangan-hardcode));
- site Nginx yang sudah ada dan versi Nginx (Ubuntu 24.04 biasanya 1.24).

Cadangan konfigurasi Nginx:
```bash
sudo cp -a /etc/nginx /root/reminder-deploy/nginx-backup-$(date +%F)
sudo nginx -t
```

## 1. Keputusan domain & urutan kerja

Pilih pola frontend (menentukan cookie dan CORS):

| | A. Frontend tetap `*.vercel.app` | B. Frontend di `classreminder.my.id` (disarankan) |
|---|---|---|
| `CORS_ORIGINS` | `https://reminders-class.vercel.app` | `https://classreminder.my.id` (tambah `https://www.classreminder.my.id` bila dipakai) |
| `COOKIE_SAMESITE` | `none` | `lax` |
| `COOKIE_SECURE` | `true` | `true` |
| Login admin di iPhone/Safari | bisa gagal (cookie lintas situs) | aman |

`CORS_ORIGINS` dibandingkan persis (`env.CORS_ORIGINS.includes(origin)`): tanpa spasi, tanpa `/` di akhir, dan `www` dihitung domain berbeda. Selama peralihan boleh diisi dua-duanya, dipisah koma; selama `*.vercel.app` masih dipakai, biarkan `COOKIE_SAMESITE=none`.

**Urutan kerja** (jangan loncat):
1. Inventaris (bagian 0).
2. DNS `api` dibuat dan sudah terpropagasi (bagian 2). *Status saat ini: belum dibuat.*
3. PostgreSQL dan Redis (bagian 3 dan 4), diuji dari jaringan Docker.
4. Server Pterodactyl, setup satu kali, start harian (bagian 5), diuji lewat `curl http://127.0.0.1:<PORT>/healthz` **dari VPS**.
5. Redis/Postgres diuji dari **dalam kontainer backend** (5.7).
6. Nginx + SSL (bagian 7).
7. Vercel (bagian 8), lalu pengujian akhir (bagian 9).

## 2. DNS di DomaiNesia

1. DomaiNesia → Domain → `classreminder.my.id` → **Kelola DNS** (pastikan nameserver domain memang milik DomaiNesia).
2. Tambah record `A`: Host `api`, Value `188.166.177.117`, TTL terkecil yang tersedia.
3. Pola B: di Vercel **Settings → Domains → Add** `classreminder.my.id`, lalu salin record yang diminta Vercel persis ke DomaiNesia.
4. Verifikasi dari VPS atau laptop:
   ```bash
   dig +short api.classreminder.my.id        # harus 188.166.177.117
   ```
   Jangan lanjut ke Certbot sebelum hasilnya benar.

## 3. PostgreSQL

### 3.1 Pilihan

Scheduler menjalankan `reconcile` tiap 60 detik (`setInterval(..., 60_000)`), jadi database **tidak pernah idle**. Neon Free memberi 100 CU-jam/bulan per project dan scale-to-zero 5 menit yang tidak bisa dimatikan. Compute 0,25 CU yang aktif terus butuh sekitar 182 CU-jam (730 jam × 0,25), jadi **Neon Free tidak cukup untuk 24/7** (batas gratis habis dan layanan dibatasi). Tanpa mengubah kode, pilihan yang cocok:

| Opsi | Cocok untuk | Catatan |
|---|---|---|
| **A. Postgres terpisah di VPS (Docker)** — disarankan | 24/7 gratis | Kamu mengurus backup sendiri. Butuh sekitar 256–512 MiB RAM dan beberapa GB disk. VPS ini punya 8 GB RAM dan 160 GB disk. |
| B. Neon berbayar | tanpa mengurus server | Biaya bulanan; cek harga terbaru di dashboard Neon. |
| C. Neon Free | uji coba saja | Habis jatah di pertengahan bulan; jangan untuk penggunaan nyata. |

Panduan ini memakai opsi A (satu image dengan `docker-compose.yml` repo: `postgres:16-alpine`). Untuk Neon, string koneksi non-pooler dan `DATABASE_SSL=true`.

### 3.2 Jalankan Postgres (setelah memeriksa jaringan di 4.1)

Pakai variabel `NET`, `SUBNET`, `GW` dari [4.1](#41-cek-jaringan-docker-yang-dipakai-wings-jangan-hardcode).

```bash
PG_PASS=$(openssl rand -hex 24)
echo "$PG_PASS"              # simpan di password manager sekarang

sudo docker run -d --name reminder-postgres --restart unless-stopped \
  -e POSTGRES_USER=reminder -e POSTGRES_PASSWORD="$PG_PASS" -e POSTGRES_DB=reminder \
  -p "$GW:5440:5432" \
  -v reminder-pg-data:/var/lib/postgresql/data \
  --memory 512m \
  postgres:16-alpine

sudo ufw status | grep -q '^Status: active' && sudo ufw allow from "$SUBNET" to "$GW" port 5440 proto tcp
```

Verifikasi:
```bash
sudo ss -tlnp | grep 5440           # hanya di <GATEWAY>, bukan 0.0.0.0
sudo docker run --rm --network "$NET" -e PGPASSWORD="$PG_PASS" postgres:16-alpine \
  psql -h "$GW" -p 5440 -U reminder -d reminder -c "select version();"
nc -zv -w 3 188.166.177.117 5440    # dari luar: harus gagal
```

`DATABASE_URL=postgres://reminder:<PG_PASS>@<GATEWAY>:5440/reminder` dan `DATABASE_SSL=false` (lalu lintas tidak meninggalkan VPS). `pgcrypto` dibuat oleh migrasi `001_init.sql`; user `reminder` adalah superuser di kontainer ini, jadi cukup.

### 3.3 Backup dan restore

```bash
sudo mkdir -p /root/backup/reminder
sudo tee /root/backup/reminder-backup.sh >/dev/null <<'EOF'
#!/bin/bash
set -euo pipefail
DIR=/root/backup/reminder
docker exec reminder-postgres pg_dump -U reminder -Fc reminder > "$DIR/reminder-$(date +%F-%H%M).dump"
find "$DIR" -name 'reminder-*.dump' -mtime +14 -delete
EOF
sudo chmod 700 /root/backup/reminder-backup.sh
echo '15 3 * * * root /root/backup/reminder-backup.sh' | sudo tee /etc/cron.d/reminder-backup
sudo /root/backup/reminder-backup.sh && ls -lh /root/backup/reminder
```

Salin file `.dump` ke tempat lain secara berkala (laptop atau penyimpanan cloud); cadangan di VPS yang sama hilang bila VPS hilang.

Uji restore ke database sementara (lakukan sekali, jangan ke database produksi):
```bash
LATEST=$(ls -t /root/backup/reminder/*.dump | head -1)
sudo docker exec reminder-postgres createdb -U reminder restore_test
sudo docker exec -i reminder-postgres pg_restore -U reminder -d restore_test < "$LATEST"
sudo docker exec reminder-postgres psql -U reminder -d restore_test -c "select count(*) from reminders;"
sudo docker exec reminder-postgres dropdb -U reminder restore_test
```

## 4. Redis terisolasi

Redis baru dalam kontainer sendiri, **bukan** Redis milik panel. BullMQ butuh `maxmemory-policy noeviction`; menyentuh Redis panel berisiko, jadi tidak dilakukan.

### 4.1 Cek jaringan Docker yang dipakai Wings (jangan hardcode)

Hanya membaca:
```bash
sudo grep -A8 '^  network:' /etc/pterodactyl/config.yml     # nama jaringan, dns, interface
sudo docker network ls
NET=pterodactyl_nw                                          # ganti bila config.yml memakai nama lain
SUBNET=$(sudo docker network inspect "$NET" --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}')
GW=$(sudo docker network inspect "$NET" --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}')
echo "net=$NET subnet=$SUBNET gateway=$GW"
cat /etc/docker/daemon.json 2>/dev/null                     # cari "userland-proxy": false
```

Kontainer server Pterodactyl akan mengakses layanan lewat alamat gateway (`$GW`) ini. Cara ini bergantung pada `userland-proxy` Docker (default **aktif**). Kalau `daemon.json` mengatur `"userland-proxy": false`, pakai [Rencana B](#44-rencana-b-bila-uji-dari-kontainer-gagal).

### 4.2 Jalankan Redis

```bash
REDIS_PASS=$(openssl rand -hex 24)
echo "$REDIS_PASS"            # simpan di password manager sekarang

sudo docker run -d --name reminder-redis --restart unless-stopped \
  -p "$GW:6390:6379" \
  -v reminder-redis-data:/data \
  --memory 256m \
  redis:7-alpine \
  redis-server --requirepass "$REDIS_PASS" --maxmemory-policy noeviction --appendonly yes

sudo ufw status | grep -q '^Status: active' && sudo ufw allow from "$SUBNET" to "$GW" port 6390 proto tcp
```

- `-p "$GW:6390:6379"` mempublikasikan port hanya di IP gateway, bukan di IP publik. Port `6390` dipilih agar tidak bentrok dengan Redis panel (`6379`); cek dulu bahwa `6390` bebas (bagian 0).
- Password hex supaya aman di URL tanpa escaping.

### 4.3 Verifikasi

```bash
# 1) hanya di gateway
sudo ss -tlnp | grep 6390

# 2) dari jaringan yang sama dengan server Pterodactyl
sudo docker run --rm --network "$NET" redis:7-alpine \
  redis-cli -h "$GW" -p 6390 -a "$REDIS_PASS" --no-auth-warning ping                       # PONG
sudo docker run --rm --network "$NET" redis:7-alpine \
  redis-cli -h "$GW" -p 6390 -a "$REDIS_PASS" --no-auth-warning config get maxmemory-policy   # noeviction

# 3) dari luar (laptop) harus GAGAL
nc -zv -w 3 188.166.177.117 6390

# 4) Redis panel tidak tersentuh
sudo ss -tlnp | grep 6379
```

Uji dari kontainer **backend yang sebenarnya** ada di [5.7](#57-uji-konektivitas-dari-dalam-kontainer-backend), setelah server dibuat. Uji di sini baru membuktikan jaringan, bukan kontainer Pterodactyl.

`REDIS_URL=redis://:<REDIS_PASS>@<GATEWAY>:6390`.

### 4.4 Rencana B (bila uji dari kontainer gagal)

Gabungkan Redis ke jaringan Wings dengan IP tetap, tanpa mempublikasikan port apa pun:
```bash
sudo docker network inspect "$NET" --format '{{range .Containers}}{{.IPv4Address}} {{end}}'   # lihat IP yang terpakai
# pilih IP bebas di dalam $SUBNET (contoh: dekat ujung atas rentang), lalu:
sudo docker rm -f reminder-redis
sudo docker run -d --name reminder-redis --restart unless-stopped \
  --network "$NET" --ip <IP_BEBAS_DI_SUBNET> -v reminder-redis-data:/data --memory 256m \
  redis:7-alpine redis-server --requirepass "$REDIS_PASS" --maxmemory-policy noeviction --appendonly yes
```
`REDIS_URL=redis://:<REDIS_PASS>@<IP_BEBAS_DI_SUBNET>:6379`. Pakai IP, bukan nama kontainer: Wings biasanya menetapkan DNS sendiri sehingga nama kontainer tidak terselesaikan. Redis tetap tidak terbuka ke internet, tetapi server lain di jaringan Wings bisa mencapainya; password melindunginya.

## 5. Server Pterodactyl

### 5.1 Pilih port
Cari port bebas (bagian 0). Contoh di bawah memakai `4000`. **Port allocation = `PORT` di `.env`.**

### 5.2 Allocation dan uji pemetaan port

Panel → **Admin → Nodes → Singapore-01 → Allocation**: tambah IP `127.0.0.1`, port `4000`.

Maksudnya: Wings memetakan port host ke port kontainer yang sama pada IP allocation, jadi `127.0.0.1:4000` di host meneruskan ke `:4000` dalam kontainer, dan hanya Nginx di VPS yang bisa mencapainya. Port Docker yang dipublikasikan di IP publik **melewati ufw**, itulah alasan tidak memakai IP publik. Asumsi ini **harus dibuktikan** setelah server pertama dijalankan (5.6):

```bash
UUID=<UUID server: panel → server → Settings → Debug Information → UUID>
sudo docker ps --filter "name=$UUID" --format 'table {{.Names}}\t{{.Ports}}'
sudo docker port "$UUID"
sudo docker inspect "$UUID" --format '{{json .HostConfig.PortBindings}}'
sudo ss -tlnp | grep ':4000'
curl -sS -i http://127.0.0.1:4000/healthz
```

Hasil yang diharapkan: `127.0.0.1:4000->4000/tcp` pada `docker port`, `ss` menunjukkan `127.0.0.1:4000`, dan `curl` mengembalikan `200 {"status":"ok"}`.

| Temuan | Artinya | Tindakan |
|---|---|---|
| `docker port` tidak menampilkan `127.0.0.1:4000->4000` | Allocation yang terpasang di server bukan yang dibuat tadi | Panel → server → **Network**: jadikan `127.0.0.1:4000` allocation utama, restart. |
| `docker port` benar tapi `curl` ditolak | Aplikasi belum listen atau belum start | Lihat console; pastikan log `API listening ... "host":"0.0.0.0","port":4000`. |
| Port muncul di `0.0.0.0:4000` atau IP publik | Allocation memakai IP publik | Pindahkan ke `127.0.0.1`; jangan lanjut ke Nginx sebelum tes eksternal (9) gagal seperti seharusnya. |
| Panel menolak allocation `127.0.0.1` | Versi panel/Wings tidak mengizinkan | Rencana B: lihat bawah. |

**Rencana B untuk allocation** (hanya bila `127.0.0.1` tidak bisa dipakai): pakai IP kontainer di jaringan Wings sebagai target `proxy_pass`:
```bash
sudo docker inspect "$UUID" --format '{{(index .NetworkSettings.Networks "'"$NET"'").IPAddress}}'
```
IP ini bisa berubah ketika kontainer dibuat ulang (mis. setelah reinstall atau perubahan allocation), sehingga Nginx harus diperbarui. Karena rapuh, ini hanya cadangan.

### 5.3 Buat server
**Admin → Servers → Create New**:
- Egg: **Node.js Generic**. Docker image: pilih **`ghcr.io/ptero-eggs/yolks:nodejs_22`** (bawaan egg adalah `nodejs_25`; pilih 22 secara eksplisit).
- Allocation: `127.0.0.1:4000`.
- Memory: **1536 MiB** (rentang aman 1024–2048 MiB: `npm install` dan `tsc` butuh lebih banyak dari proses harian), Swap 0, CPU 100–200 %, Disk ≥ 5120 MB.
- Variabel egg: **`USER_UPLOAD = 1`** (melewati installer yang meng-clone Git; tanpa ini installer mencoba `git clone null.git` dan gagal), `AUTO_UPDATE = 0`, `MAIN_FILE = dist/server.js` (14 karakter, di bawah batas 16), `GIT_ADDRESS`/`BRANCH`/`USERNAME`/`ACCESS_TOKEN`/`NODE_PACKAGES`/`UNNODE_PACKAGES`/`NODE_ARGS` dikosongkan.

Startup command bawaan egg menjalankan `npm install` di setiap start lalu menjalankan `MAIN_FILE`. Panduan ini mengganti command tersebut dengan perintah yang eksplisit (5.5 dan 5.6) supaya instalasi/build tidak tercampur dengan start harian. Mengubah Startup Command butuh akun admin (**Admin → Servers → server → Startup**).

### 5.4 Upload kode dan `.env`
Repo private dan `backend` adalah subfolder, jadi unggah file langsung. Commit yang diunggah sebaiknya yang CI-nya hijau:

```bash
cd /workspaces/reminder && git pull
git archive --format=zip -o reminder-backend.zip HEAD:backend
```
Unduh zip, di panel **Files → Upload**, lalu **Unarchive** di root server (`package.json` harus berada di root, bukan di subfolder). `node_modules` dan `.env` tidak ikut karena tidak ada di git.

Buat `.env` lewat **Files → New File** (isinya di [bagian 6](#6-environment-variables)). Aplikasi membaca `.env` dari direktori kerja (`dotenv/config`), jadi variabel egg tidak perlu ditambah.

### 5.5 Setup satu kali: install, build, migrasi, seed Owner
Ini **bukan** perintah start harian. Di tab **Startup**, ganti Startup Command sementara:

```
npm install --include=dev && npm run build && npm run migrate:prod && npm run seed:prod
```

Start dan awasi console. Proses selesai sendiri dan server kembali offline. Hasil yang diharapkan:
- install dan build tanpa error (CI sudah membuktikan `tsc` dan `build` lolos dengan Node 22);
- migrasi: `applied 001_init.sql`, `applied 002_manual_send_push.sql`, `applied 003_public_page.sql` (atau `database is up to date` bila diulang);
- seed: `created owner account ...` (hanya bila Owner belum ada).

Catatan:
- Repo belum punya `package-lock.json`, jadi pakai `npm install`, bukan `npm ci`.
- `--include=dev` wajib: TypeScript ada di devDependencies.
- `seed:prod` juga **mengembalikan izin bawaan role admin** ke default. Jalankan pada setup pertama atau setelah menambah permission baru, bukan di setiap update.
- Setelah seed berhasil: **hapus baris `OWNER_PASSWORD` dari `.env`**, lalu login dan ganti password Owner (aplikasi memaksanya).

### 5.6 Start harian
Ganti Startup Command menjadi:
```
node dist/server.js
```
Start. Log yang benar:
```
"msg":"API listening","host":"0.0.0.0","port":4000
"msg":"delivery worker started"
```
Tidak boleh ada `redis error` atau `worker error` berulang. Setelah itu jalankan uji pemetaan port di [5.2](#52-allocation-dan-uji-pemetaan-port).

`HOST=0.0.0.0` di dalam kontainer wajib; backend memakai `app.listen(env.PORT, env.HOST)` (default `0.0.0.0`). Kalau `127.0.0.1`, Docker tidak bisa meneruskan koneksi masuk.

### 5.7 Uji konektivitas dari dalam kontainer backend
Dari VPS (kontainer harus sedang berjalan). Perintah ini memakai `dotenv` dan `ioredis`/`pg` yang sudah terpasang di server, dan **tidak mencetak password**:

```bash
UUID=<UUID server>
sudo docker exec -w /home/container "$UUID" node -e "
require('dotenv/config');
const R=require('ioredis');const r=new R(process.env.REDIS_URL,{maxRetriesPerRequest:1});
r.ping().then(x=>{console.log('redis ping:',x);return r.config('GET','maxmemory-policy')})
 .then(x=>{console.log('redis policy:',x.join('='));process.exit(0)})
 .catch(e=>{console.log('redis ERROR:',e.message);process.exit(1)});"

sudo docker exec -w /home/container "$UUID" node -e "
require('dotenv/config');
const {Pool}=require('pg');
const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
p.query('select now()').then(r=>{console.log('postgres OK',r.rows[0].now);process.exit(0)})
 .catch(e=>{console.log('postgres ERROR:',e.message);process.exit(1)});"
```
Hasil yang diharapkan: `redis ping: PONG`, `redis policy: maxmemory-policy=noeviction`, `postgres OK <waktu>`. Kalau `ECONNREFUSED`/timeout, kembali ke [4.4](#44-rencana-b-bila-uji-dari-kontainer-gagal) atau cek ufw (aturan di 3.2/4.2).

### 5.8 Update kode berikutnya
1. Buat zip baru (5.4), unggah dengan menimpa file lama (jangan menghapus `.env`).
2. Startup Command sementara: `npm install --include=dev && npm run build && npm run migrate:prod`.
3. Start, tunggu selesai, kembalikan ke `node dist/server.js`, Start.

## 6. Environment variables

Isi `.env` di server Pterodactyl:

```ini
NODE_ENV=production
PORT=4000
HOST=0.0.0.0
LOG_LEVEL=info
TRUST_PROXY=1

# PostgreSQL (opsi A bagian 3). Untuk Neon: string koneksi non-pooler + DATABASE_SSL=true
DATABASE_URL=postgres://reminder:<PG_PASS>@<GATEWAY>:5440/reminder
DATABASE_SSL=false

# Redis (bagian 4)
REDIS_URL=redis://:<REDIS_PASS>@<GATEWAY>:6390
RUN_WORKER=true
DELIVERY_MAX_ATTEMPTS=5

# Auth: openssl rand -base64 48  (minimal 32 karakter)
JWT_ACCESS_SECRET=<acak panjang>
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_DAYS=14

# CORS & cookie (tabel di bagian 1)
CORS_ORIGINS=https://reminders-class.vercel.app
COOKIE_SECURE=true
COOKIE_SAMESITE=none
COOKIE_DOMAIN=

DEFAULT_TIMEZONE=Asia/Kuala_Lumpur

# Owner awal, hanya dipakai seed (hapus OWNER_PASSWORD setelah seed)
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
- `CORS_ORIGINS` mencakup domain frontend yang benar-benar dipakai pengguna (bagian 1). Kalau kurang, browser menolak request ("blocked by CORS policy").
- `COOKIE_DOMAIN` kosong: cookie host-only di `api.classreminder.my.id` sudah cukup untuk pola A maupun B. Jangan mengisinya dengan URL.
- Variabel yang salah membuat backend keluar saat start dengan daftar `- NAMA: pesan` (validasi zod di `env.ts`).
- Mengganti kunci VAPID membuat semua langganan notifikasi lama tidak berlaku; pengguna harus mengaktifkan notifikasi ulang.

## 7. Nginx + SSL (Certbot)

Hanya **file baru**; konfigurasi panel tidak disentuh. Pastikan bagian 0 sudah dijalankan (cadangan dan `nginx -t`).

### 7.1 Tahap 1: HTTP saja (untuk verifikasi domain)
```bash
sudo mkdir -p /var/www/html
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
Hasil yang diharapkan: `syntax is ok` dan `test is successful`. Kalau `nginx -t` gagal, **hapus symlink** (rollback) sebelum melanjutkan.

### 7.2 Sertifikat (tidak mengedit konfigurasi Nginx lain)
```bash
sudo certbot certonly --webroot -w /var/www/html -d api.classreminder.my.id \
  --deploy-hook "systemctl reload nginx"
```
Prasyarat: DNS sudah benar (bagian 2) dan port 80 terbuka dari internet.

### 7.3 Tahap 2: HTTPS
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
`ssl_session_cache` memakai nama zona unik (`SSL_reminder_api`) agar tidak bentrok dengan zona milik site panel. Kalau Nginx ≥ 1.25.1, `listen ... http2` hanya memunculkan peringatan deprecated, bukan error.

`TRUST_PROXY=1` cocok dengan satu lapis proxy ini. Kalau suatu saat Cloudflare dipasang di depan Nginx, ubah ke `2` dan sesuaikan header.

### 7.4 Pembaruan sertifikat
```bash
sudo certbot renew --dry-run
systemctl list-timers | grep -i certbot
```

## 8. Vercel

1. **Settings → Environment Variables**: `VITE_API_URL` = `https://api.classreminder.my.id/api/v1` (hapus nilai Codespaces).
2. **Deployments → ⋯ pada deployment teratas → Redeploy**. Variabel `VITE_*` hanya terbaca saat build.
3. Pola B: tambahkan domain `classreminder.my.id` (bagian 2). Di `.env` backend ubah `CORS_ORIGINS=https://classreminder.my.id` dan `COOKIE_SAMESITE=lax`, restart server Pterodactyl.

## 9. Pengujian

Dari laptop:
```bash
# 1) HTTPS dan database
curl -i https://api.classreminder.my.id/healthz            # 200 {"status":"ok"}  (503 = cek DATABASE_URL)

# 2) Auth aktif (tanpa token harus 401)
curl -s -o /dev/null -w "%{http_code}\n" https://api.classreminder.my.id/api/v1/reminders

# 3) CORS (header harus ada untuk origin terdaftar, dan TIDAK ada untuk origin lain)
curl -si https://api.classreminder.my.id/api/v1/reminders -H "Origin: https://reminders-class.vercel.app" | grep -i access-control-allow-origin
curl -si https://api.classreminder.my.id/api/v1/reminders -H "Origin: https://contoh-salah.example" | grep -i access-control-allow-origin || echo "tidak ada (benar)"
#   Ulangi dengan https://classreminder.my.id bila dipakai.

# 4) Port internal TIDAK terbuka dari internet (semua harus gagal/timeout)
nc -zv -w 3 188.166.177.117 4000
nc -zv -w 3 188.166.177.117 6390
nc -zv -w 3 188.166.177.117 5440
```

Dari VPS:
```bash
sudo ss -tlnp | grep -E ':(4000|6390|5440)\b'    # 4000 di 127.0.0.1; 6390/5440 di <GATEWAY>
curl -sS http://127.0.0.1:4000/healthz
# Panel dan layanan lama tetap sehat:
curl -sI https://panel.cuanxuan.my.id | head -1
systemctl is-active wings
sudo nginx -t
```

Ketahanan:
```bash
sudo docker restart reminder-redis      # backend harus pulih sendiri; cek console tanpa error terus-menerus
sudo docker restart reminder-postgres   # idem
# lalu reboot VPS terjadwal (opsional): semua --restart unless-stopped harus hidup kembali,
# dan Wings menyalakan server Pterodactyl sendiri.
```

Di aplikasi:
1. Buka frontend → login Owner → ganti password.
2. **Settings**: timezone `Asia/Kuala_Lumpur`, aktifkan `public.enabled`.
3. Tambah penerima, buat pengingat, **Mark as sent**. Pengingat muncul di halaman publik.
4. Aktifkan notifikasi di HP (iPhone: Add to Home Screen dulu), kirim pengingat, pastikan notifikasi masuk.
5. Console Pterodactyl: tidak ada `redis error` atau `worker error`.

## 10. Rollback

Rollback berjalan dari yang terbaru ke yang terlama. Layanan lama tidak pernah diubah, jadi tidak ada yang perlu dikembalikan di sana.

| Masalah | Langkah |
|---|---|
| Frontend rusak setelah ganti `VITE_API_URL` | Vercel → Deployments → deployment lama → **Instant Rollback**, atau kembalikan variabel lalu Redeploy. |
| Backend gagal start setelah update | Unggah zip commit sebelumnya (`git archive --format=zip -o old.zip <commit-lama>:backend`), setup tanpa seed (5.8), start. Migrasi hanya menambah tabel/kolom; jangan membuang skema tanpa cadangan (3.3). |
| Nginx bermasalah | `sudo rm /etc/nginx/sites-enabled/api.classreminder.my.id.conf && sudo nginx -t && sudo systemctl reload nginx`. Cadangan penuh: `/root/reminder-deploy/nginx-backup-<tanggal>`. Site panel tidak terpengaruh. |
| Sertifikat salah | `sudo certbot delete --cert-name api.classreminder.my.id` (setelah site dilepas dari Nginx). |
| Redis bermasalah | `sudo docker stop reminder-redis`. Pengingat tetap ada di Postgres; scheduler memuat ulang antrean dari tabel `scheduled_jobs` tiap 60 detik setelah Redis hidup. |
| Postgres bermasalah | Restore dari `.dump` terbaru (3.3) ke database baru, arahkan `DATABASE_URL`, restart server. |
| Berhenti total | Hapus server `reminder-api` di panel; `sudo docker rm -f reminder-redis reminder-postgres`; hapus volume **hanya bila data tidak diperlukan lagi**: `sudo docker volume rm reminder-redis-data reminder-pg-data`; hapus aturan ufw yang ditambahkan (`sudo ufw status numbered`, lalu `sudo ufw delete <nomor>`); hapus site Nginx dan cert; hapus record DNS `api`; hapus allocation `127.0.0.1` di panel bila tidak dipakai. Bandingkan dengan `/root/reminder-deploy/inventory-before.txt`. |
| Cadangan sementara | Backend Codespaces bisa dipakai untuk uji coba (`docs/TESTING.md`), bukan untuk penggunaan nyata. |

Aturan keselamatan: jangan menjalankan `docker system prune`, `docker volume prune`, atau `docker network rm pterodactyl_nw` di VPS ini; semuanya bisa menghapus data layanan lain.

## 11. Troubleshooting

| Gejala | Penyebab umum | Perbaikan |
|---|---|---|
| Console: `Invalid environment configuration` lalu keluar | Variabel salah (mis. `JWT_ACCESS_SECRET` < 32 karakter, `COOKIE_SECURE` bukan `true` di production, `SAMESITE=none` tanpa `SECURE=true`) | Baca baris `- NAMA: pesan`, perbaiki `.env`, start ulang. |
| Installer egg gagal: `git clone null.git` | `USER_UPLOAD` bukan 1 | Set `USER_UPLOAD=1` di tab Startup, lalu unggah file manual (5.4). |
| `Cannot find module .../dist/server.js` | Build belum jalan/gagal | Jalankan lagi setup 5.5, baca error `tsc`. |
| `tsc: not found` saat build | devDependencies tidak terpasang | Pakai `npm install --include=dev`. |
| `502 Bad Gateway` | Server mati, atau port `proxy_pass` ≠ allocation | Start server; samakan port; lihat `ss -tlnp`. |
| `curl 127.0.0.1:4000` dari VPS gagal padahal server jalan | `HOST=127.0.0.1`, `PORT` ≠ allocation, atau allocation bukan `127.0.0.1:4000` | Ikuti tabel 5.2. |
| `redis error` berulang, `ECONNREFUSED` | Kontainer Redis mati, `GW` salah, ufw memblokir, atau `userland-proxy` mati | `sudo docker ps`, cek 4.1/4.2, uji 5.7, lalu Rencana B (4.4). |
| `NOAUTH` / `WRONGPASS` | Password di `REDIS_URL` tidak cocok | Perbaiki `REDIS_URL` tanpa spasi/kutip. |
| `healthz` = `database_unavailable` | `DATABASE_URL` salah, Postgres mati, atau ufw memblokir port 5440 | Uji 5.7 (postgres). Untuk Neon: `DATABASE_SSL=true`. |
| Browser: `blocked by CORS policy` | Origin tidak ada di `CORS_ORIGINS` (beda `www`, `http`, spasi) | Tambah origin persis, restart, ulangi tes 9.3. |
| Login berhasil tapi kembali ke halaman login | Cookie lintas situs diblokir (pola A di Safari) atau `SECURE`/`SAMESITE` salah | Pakai pola B (domain sendiri, `lax`). |
| Banyak pengguna kena `rate_limited` bersamaan | `TRUST_PROXY` salah, semua IP terbaca sebagai IP Nginx | `TRUST_PROXY=1` dan header seperti 7.3. |
| Certbot: `Connection refused` / `Timeout` | DNS belum benar atau port 80 diblokir | `dig`, `ufw allow 80/tcp`, firewall penyedia VPS. |
| Port 4000 bisa diakses dari internet | Allocation memakai IP publik/`0.0.0.0` | Allocation `127.0.0.1`, pindahkan server. |
| `nginx -t` gagal setelah menambah site | Konflik `ssl_session_cache`/`default_server`, atau typo | Hapus symlink, `nginx -t`, perbaiki; lihat output `nginx -T` di inventaris. |
| Notifikasi tidak masuk | VAPID kosong, HP belum subscribe (iPhone belum Add to Home Screen), `public.enabled` mati | Isi VAPID, aktifkan ulang notifikasi, cek setting. |
