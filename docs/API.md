# API (v1)

Base path `/api/v1`. JSON in/out. Auth: `Authorization: Bearer <accessToken>`.
Errors: `{ "error": { "code", "message", "details?" } }` (422 for validation, 401/403 auth, 409 conflict).
Lists: `{ items, page, pageSize, total }`.

All endpoints below are implemented as of Phase 3, except WhatsApp delivery itself: the backend hands messages to the bot service (Phase 4), and delivery statuses after `accepted` (`sent`, `delivered`, `read`) arrive from WhatsApp webhooks in Phase 4.

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

## Reminders 
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

## Templates, recipients 
`GET/POST /templates`, `PATCH/DELETE /templates/:id` (templates.read / templates.manage); same for `/recipients` (recipients.read / recipients.manage). List responses are `{items}`.

## Admins 
`GET /admins`, `POST /admins`, `PATCH /admins/:id`, `DELETE /admins/:id`, `POST /admins/:id/reset-password`, `PATCH /admins/me`, `GET /permissions` -> `{items, defaults}`.
Rules: Owner is immutable; granting is limited to permissions the actor holds; new/reset accounts get `must_change_password`.

## Logs and settings 
`GET /delivery-logs?status&page&pageSize` (logs.delivery). `GET/PUT /settings` -> `{settings}` (settings.read / settings.update).

## Scheduling behavior
- `POST /reminders/:id/schedule` and `/send` need at least one active recipient (422 `no_recipients`). Cloud API recipients are sent automatically. **Manual-share recipients** become tasks: at the scheduled time the reminder gets status `due` and admins with `reminders.send` receive a push notification.
- A scheduled reminder is a `scheduled_jobs` row (source of truth) plus a delayed BullMQ job. If Redis loses the job, a reconcile pass (boot + every minute) re-adds it. Scheduling the same instant twice resolves to one job.
- Delivery rows are keyed `reminder:<id>:recipient:<id>:run:<scheduled epoch>` (unique), so retries and re-runs never create a second delivery for a recipient.
- Transient failures (network, 429, 5xx) are retried with exponential backoff up to `DELIVERY_MAX_ATTEMPTS`; other failures fail immediately. `POST /reminders/:id/retry` re-queues only failed deliveries.
- With `BOT_SERVICE_URL`/`BOT_API_KEY` unset, deliveries fail with `bot_not_configured`. Nothing is simulated.
- Recurring reminders create the next occurrence as a new pending reminder after a successful send.

## Internal (bot -> backend)
`POST /internal/whatsapp/statuses` with header `X-API-Key: <BOT_API_KEY>` and body `{ statuses: [{ waMessageId, status: sent|delivered|read|failed, timestamp, errorCode?, errorMessage? }] }` -> `{ received, applied }`. Not callable with admin tokens.

## Bot service API (backend -> bot)
`POST /v1/messages` (`X-API-Key`, `Idempotency-Key`) `{ deliveryId, idempotencyKey, body, recipient: { type, phone_e164, wa_group_id } }` -> `202 { messageId }` or `4xx/5xx { error }`. 503 and 429 mean retryable.
`GET /webhook` (Meta verification), `POST /webhook` (signed by Meta), `GET /healthz`.

## Manual sending and push notifications
| Method | Path | Notes |
|---|---|---|
| POST | `/reminders/:id/mark-sent` | `due` -> `sent`; reminders.send. Only records that an admin sent it; WhatsApp gives no confirmation |
| GET | `/push/config` | `{enabled, publicKey, devices}` |
| POST | `/push/subscribe` | `{endpoint, keys:{p256dh,auth}}` (browser PushSubscription) |
| POST | `/push/unsubscribe` | `{endpoint}` |
| POST | `/push/test` | sends a test notification to the caller's devices |

Reminder objects include `manual_shares: [{recipient_id, name, done}]`. Reminder statuses: `draft`, `pending`, `due`, `sent`, `failed`, `cancelled`.
