# Architecture

```
 GitHub Pages (static)        VPS (Ubuntu, Pterodactyl, Nginx + HTTPS)
┌────────────────┐  HTTPS   ┌─────────────┐   ┌────────────┐
│ React frontend │ ───────▶ │ Backend API │──▶│ PostgreSQL │
└────────────────┘  JWT     │  (Express)  │   └────────────┘
                            │  + BullMQ   │──▶ Redis (queue)
                            └──────┬──────┘
                          API key  │  ▲ webhooks (signature verified)
                            ┌──────▼──────┐
                            │  WhatsApp   │──▶ Meta Cloud API
                            │  Bot svc    │
                            └─────────────┘
```

- Frontend never holds secrets; it only talks to the backend with a short-lived access token.
- Backend owns the database, the job queue and all business rules.
- Bot service is separate: it only sends messages and receives webhooks, authenticated to the backend with `BOT_API_KEY`.
- Scheduling is server-side (BullMQ on Redis, mirrored in `scheduled_jobs`). No browser timers.

## Auth model (Phase 1)

- Password hashing: bcrypt (cost 12), 12-72 char policy.
- Access token: JWT (HS256), 15 min, carries `sub` and `tv` (token version).
- Refresh token: random 48 bytes, stored only as SHA-256 hash, httpOnly cookie scoped to `/api/v1/auth`, rotated on every use. Reusing a rotated token revokes the whole token family.
- Cookie-based endpoints (`refresh`, `logout`) also require header `X-Requested-With: reminder-web` plus a CORS origin allow-list (CSRF defense, needed for cross-site GitHub Pages deployments with `SameSite=None; Secure`).
- Lockout: 5 failed logins locks the account for 15 minutes.
- Disabling an admin, resetting or changing a password bumps `token_version` and revokes refresh tokens, so existing access tokens stop working immediately.

## RBAC

- Roles: `owner` (exactly one, all permissions, immutable) and `admin`.
- `admin` gets a default permission set from the role, and the Owner can grant/revoke individual permissions per admin (`admin_permissions` overrides).
- Escalation guard: an actor can only grant permissions they hold themselves.
- Permission keys live in one place: `backend/src/rbac/permissions.ts`.

## Data model

All tables are created in `backend/migrations/001_init.sql`: roles, permissions, role_permissions, admins, admin_permissions, refresh_tokens, recipients, reminder_templates, reminders, reminder_recipients, scheduled_jobs, delivery_logs, activity_logs, app_settings.

Duplicate-delivery protection: `delivery_logs.idempotency_key` and `scheduled_jobs.idempotency_key` are unique; WhatsApp message ids are unique when present.
