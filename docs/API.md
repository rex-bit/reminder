# API (v1)

Base path `/api/v1`. JSON in/out. Auth: `Authorization: Bearer <accessToken>`.
Errors: `{ "error": { "code", "message", "details?" } }` (422 for validation, 401/403 auth, 409 conflict).
Lists: `{ items, page, pageSize, total }`.

Status column: **done** = implemented in Phase 1, **planned** = contract the Phase 2 frontend already calls, to be built in Phase 3/4.

## Auth (done)
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | `{identifier, password}` -> `{accessToken, admin}`; sets httpOnly refresh cookie |
| POST | `/auth/refresh` | cookie + `X-Requested-With: reminder-web` -> `{accessToken}` |
| POST | `/auth/logout` | 204 |
| GET | `/auth/me` | `{admin}` incl. `permissions[]` |
| POST | `/auth/change-password` | `{currentPassword,newPassword}` -> `{accessToken}` |

## Activity (done)
`GET /activity?page&pageSize&action&adminId` - needs `logs.activity`.

## Reminders (planned)
| Method | Path | Permission |
|---|---|---|
| GET | `/reminders?status=a,b&kind&q&page&pageSize&sort` | reminders.read |
| GET | `/reminders/stats` -> `{counts, next[], recent[]}` | reminders.read |
| POST | `/reminders` | reminders.create |
| GET / PATCH / DELETE | `/reminders/:id` -> `{reminder}` | read / update / delete |
| POST | `/reminders/:id/duplicate` -> `{reminder}` (draft) | reminders.create |
| POST | `/reminders/:id/schedule` `{scheduledAt}` (also reschedule) | schedule.manage |
| POST | `/reminders/:id/cancel` | schedule.manage |
| POST | `/reminders/:id/send` (send now) | reminders.send |
| POST | `/reminders/:id/retry` -> `{queued}` | reminders.send |
| GET | `/reminders/:id/deliveries` -> `{items}` | logs.delivery |

## Templates, recipients (planned)
`GET/POST /templates`, `PATCH/DELETE /templates/:id` (templates.read / templates.manage); same for `/recipients` (recipients.read / recipients.manage). List responses are `{items}`.

## Admins (planned)
`GET /admins`, `POST /admins`, `PATCH /admins/:id`, `DELETE /admins/:id`, `POST /admins/:id/reset-password`, `PATCH /admins/me`, `GET /permissions` -> `{items, defaults}`.
Rules: Owner is immutable; granting is limited to permissions the actor holds; new/reset accounts get `must_change_password`.

## Logs and settings (planned)
`GET /delivery-logs?status&page&pageSize` (logs.delivery). `GET/PUT /settings` -> `{settings}` (settings.read / settings.update).
