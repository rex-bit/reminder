# Reminder System + WhatsApp Bot

Personal project: reminder management for admins, with scheduled delivery through the official WhatsApp Business Platform (Cloud API).

## Layout

| Dir | Purpose | Status |
|---|---|---|
| `backend/` | Express + PostgreSQL REST API (auth, RBAC, reminders, scheduler) | Phase 1 done |
| `bot/` | Separate WhatsApp Cloud API service | Phase 4 |
| `frontend/` | React + TS, Material 3 (deployable to GitHub Pages) | Phase 2 |
| `docs/` | Architecture, API, deployment | ongoing |

Frontend, backend and bot are independent packages (no root workspace) so each can be deployed on its own.

## Phase 1 quick start (backend)

```bash
docker compose up -d            # local Postgres + Redis
cd backend
cp .env.example .env            # fill in secrets (see comments inside)
npm install
npm run migrate                 # apply SQL migrations
npm run seed                    # roles, permissions, first Owner account
npm run dev                     # http://localhost:4000/healthz
```

Generate secrets with `openssl rand -base64 48`.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/API.md`](docs/API.md).

## WhatsApp limitations (read before Phase 4)

- Only the official Cloud API is used. No WhatsApp Web automation or QR login.
- Sending to arbitrary existing groups is **not assumed** to be possible. Group eligibility will be verified against current Meta docs in Phase 4; until then group recipients use the manual-share fallback (admin action required).
- Business-initiated messages outside the 24h window need approved templates.
