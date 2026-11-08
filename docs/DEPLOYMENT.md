# Deployment

> Setup khusus VPS Pterodactyl + Neon + Vercel (`api.classreminder.my.id`): lihat [VPS-PTERODACTYL.md](VPS-PTERODACTYL.md).

```
Vercel (static frontend, HTTPS)
        │  A) direct to https://api.example.com   or   B) /api/* rewrite proxied by Vercel
        ▼
Nginx on the VPS (HTTPS, certbot)
  ├─ api.example.com            -> Pterodactyl server "reminder-api"  (127.0.0.1:<API_PORT>)
  └─ bot.example.com/webhook    -> Pterodactyl server "reminder-bot"  (127.0.0.1:<BOT_PORT>)
PostgreSQL 16 + Redis 7 on the VPS host (not exposed to the internet)
```

The backend (with its delivery worker) and the bot are **two separate Pterodactyl servers**. The bot's `/v1/messages` is only used by the backend, so only `/webhook` is exposed publicly.

## 1. Frontend on Vercel
1. Import the repo, **Root Directory = `frontend`**, Framework = Vite (build `npm run build`, output `dist`).
2. Pick one API mode:

| | A) Custom domain, direct (recommended) | B) Vercel rewrite proxy |
|---|---|---|
| Needs | A domain, e.g. `app.example.com` (Vercel) + `api.example.com` (VPS) | Nothing extra |
| Vercel env | `VITE_API_URL=https://api.example.com/api/v1` | `VITE_API_URL=/api/v1` and edit `YOUR-API-HOST` in `frontend/vercel.json` |
| Backend env | `CORS_ORIGINS=https://app.example.com`, `COOKIE_SECURE=true`, `COOKIE_SAMESITE=lax` | `COOKIE_SECURE=true`, `COOKIE_SAMESITE=lax`, `CORS_ORIGINS=https://<project>.vercel.app`, `TRUST_PROXY=2` (see note) |

**Do not** serve the frontend from `*.vercel.app` and call a different site's API directly: the login cookie becomes a third-party cookie, which Safari/iOS (and increasingly Chrome) block, so users get logged out on every reload. Use A or B.

Note for B: Nginx sees Vercel as the client. With `TRUST_PROXY=2` Express takes the real client IP from `X-Forwarded-For`; check that rate limiting counts per user (e.g. two different networks should not share a limit) before relying on it.
3. The build runs `vite build` only (no type check). Run `npm run typecheck` locally or in CI; the code has not been compiled yet, so expect to fix small type errors.
4. Notifications need HTTPS, which Vercel provides.

## 2. VPS prerequisites
```bash
sudo apt update && sudo apt install -y postgresql redis-server nginx certbot python3-certbot-nginx
sudo -u postgres psql -c "CREATE ROLE reminder LOGIN PASSWORD '<strong password>';"
sudo -u postgres psql -c "CREATE DATABASE reminder OWNER reminder;"
```
Pterodactyl servers run in Docker, so they reach the host through the Docker bridge (default gateway `172.18.0.1`, check with `docker network inspect pterodactyl_nw`).
- PostgreSQL: `listen_addresses = 'localhost,172.18.0.1'` in `postgresql.conf`; `host reminder reminder 172.18.0.0/16 scram-sha-256` in `pg_hba.conf`; restart.
- Redis: `bind 127.0.0.1 172.18.0.1`, `requirepass <password>`, `protected-mode yes`; restart.
- Firewall (ufw): allow 22, 80, 443 only. Do **not** open 5432/6379 or the Pterodactyl allocation ports to the internet.

Database URL from the container: `postgres://reminder:<pw>@172.18.0.1:5432/reminder`, Redis: `redis://:<pw>@172.18.0.1:6379`.

## 3. Pterodactyl: backend server
Create a server from the **Node.js** egg (Node 20 or newer), allocate a port (say 4000), upload `backend/` (git clone into the server directory or upload a release).

Startup command:
```
npm ci --no-audit && npm run build && npm run migrate:prod && PORT=${SERVER_PORT} node dist/server.js
```
First time only, from the console: `npm run seed:prod` (creates roles, permissions and the Owner from `OWNER_*`; the Owner must change the password at first login).

Environment (Startup tab or a `.env` file; never commit it). Generate secrets with `openssl rand -base64 48`.

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL`, `REDIS_URL` | from step 2 |
| `JWT_ACCESS_SECRET` | random, 32+ chars |
| `COOKIE_SECURE` | `true` |
| `COOKIE_SAMESITE` | `lax` (A or B above) |
| `CORS_ORIGINS` | your frontend origin(s) |
| `TRUST_PROXY` | `1` (Nginx) or `2` (Vercel rewrite + Nginx) |
| `DEFAULT_TIMEZONE` | e.g. `Asia/Kuala_Lumpur` |
| `OWNER_USERNAME/EMAIL/PASSWORD` | first Owner (used once by seed) |
| `BOT_API_KEY` | random, same as the bot |
| `BOT_SERVICE_URL` | `http://172.18.0.1:<BOT_PORT>` or the node IP the bot allocation binds to |
| `VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT` | `npx web-push generate-vapid-keys`; subject `mailto:you@example.com` |

## 4. Pterodactyl: bot server
Second Node.js egg server (own port, say 4100), upload `bot/`. Startup:
```
npm ci --no-audit && npm run build && PORT=${SERVER_PORT} node dist/server.js
```
Env: copy `bot/.env.example`; set `BOT_API_KEY` (same as backend), `BACKEND_URL=https://api.example.com` (or the internal address), the four `WHATSAPP_*` values from Meta, `REDIS_URL` (same Redis; used only for idempotency).
Only needed if you use the WhatsApp Cloud API. If you only use manual sharing + notifications you can skip the bot entirely and leave `BOT_SERVICE_URL` empty.

## 5. Nginx + HTTPS
`/etc/nginx/sites-available/reminder`:
```nginx
server {
  listen 80;
  server_name api.example.com;
  location / {
    proxy_pass http://127.0.0.1:4000;          # API allocation port
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 200k;
    proxy_read_timeout 30s;
  }
}
server {
  listen 80;
  server_name bot.example.com;
  location = /webhook {                          # only Meta's webhook is public
    proxy_pass http://127.0.0.1:4100;            # bot allocation port
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    client_max_body_size 1m;
  }
  location / { return 404; }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/reminder /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.example.com -d bot.example.com   # HTTPS + auto-renew
```
If the Pterodactyl allocation binds to the node's public IP, the ports must be reachable from Nginx; allocate them to `127.0.0.1` when possible, or block them from outside with the firewall.

Meta webhook: callback URL `https://bot.example.com/webhook`, verify token = `WHATSAPP_VERIFY_TOKEN`, subscribe to the `messages` field.

## 6. Logs and troubleshooting
- Pterodactyl console shows JSON logs (pino). Filter with `| grep '"level":50'` for errors.
- `curl https://api.example.com/healthz` -> `{"status":"ok"}`; 503 means the database is unreachable.
- Server exits on boot with "Invalid environment configuration": the message lists the missing variable.
- Login works but reload logs you out: cookie issue, see the A/B note (`COOKIE_SECURE`, `COOKIE_SAMESITE`, same-site domains).
- CORS error in the browser: the exact frontend origin (no trailing slash) is missing from `CORS_ORIGINS`.
- Scheduled reminder never fires: check Redis connectivity in the log; the reconcile job re-queues missing jobs every minute. Check `scheduled_jobs` for `last_error`.
- Delivery `bot_not_configured`: `BOT_SERVICE_URL`/`BOT_API_KEY` unset. `131047`/re-engagement error: outside the 24-hour window, use a template (see `docs/WHATSAPP.md`).
- No notification: Settings > Notifications must say "On for this device"; use "Send test". iPhone needs Home Screen install.
- Postgres from the container fails: check `listen_addresses`, `pg_hba.conf`, and the Docker gateway IP.
- Backups: `pg_dump -Fc reminder > reminder-$(date +%F).dump` daily via cron; Redis holds only queue state (the database is the source of truth and is re-queued by reconcile).
