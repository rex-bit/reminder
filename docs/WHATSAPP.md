# WhatsApp integration

Only Meta's official **WhatsApp Business Platform (Cloud API)** is used. No WhatsApp Web automation, reverse-engineered APIs or QR-login libraries.

## What you need from Meta
1. A Meta developer app with the WhatsApp product, a WhatsApp Business Account and a phone number registered for the **Cloud API** (not the WhatsApp Business app).
2. A permanent access token (System User token) with the `whatsapp_business_messaging` permission, the **Phone number ID**, and the app's **App Secret**.
3. A webhook subscription for the `messages` field pointing to `https://<bot-host>/webhook`, using your own `WHATSAPP_VERIFY_TOKEN`.

All of these go into `bot/.env`. They are never sent to the frontend.

## Sending to individuals: the 24-hour rule
Reminders are business-initiated. Meta delivers free-form text only inside the 24-hour window after the recipient last messaged your number. Outside it, you need an **approved message template**. Two modes:

| Mode | Config | Works when |
|---|---|---|
| Text (default) | `WHATSAPP_TEMPLATE_NAME` empty | Recipient messaged your number in the last 24 h |
| Template | `WHATSAPP_TEMPLATE_NAME=<approved template>` | Anytime. Template body must contain exactly one variable `{{1}}`; the reminder text is placed there with line breaks flattened to ` | ` because template parameters may not contain new lines |

Delivery failures from this rule appear in Delivery logs with Meta's error code.

## Groups (verified against Meta documentation)
Checked 2026-11-07 against Meta's [Groups API page](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/) and secondary write-ups:

- Requires an **Official Business Account (OBA)**; not available for WhatsApp Business app numbers or Multi-solution Conversations numbers.
- Max **8 participants** per group; up to 10,000 groups per number; one Cloud API business per group.
- Groups are **created through the API** and joined via invite link. The documentation does not say that the API can message an existing group it did not create, so **this system does not assume it can**. A normal class WhatsApp group will not work.
- Supported: text, media, text templates. Not supported: interactive messages, calling, editing/deleting messages.
- The official page does not document the send payload for groups. The bot uses the Messages API with `recipient_type: "group"` as described by secondary sources; treat it as **unverified** and test with a real eligible number before relying on it.

Therefore group sending is **off by default** in two places: `WHATSAPP_GROUPS_ENABLED=false` (bot) and Settings > "WhatsApp number is eligible for the Groups API" (backend). Group recipients should normally use **Manual share**:

- Recipient channel "Manual share" is never sent automatically and never scheduled.
- On a reminder page, "Share manually in WhatsApp" opens `wa.me/?text=...`; the admin picks the group and presses send. It is not tracked as a delivery.

The adapter boundary (`backend/src/modules/scheduler/dispatch.ts` -> `bot/src/cloudApi.ts`) is the single place to extend when Meta supports more.

## Delivery status flow
1. Backend queue job -> `POST bot/v1/messages` (header `X-API-Key`, `Idempotency-Key`).
2. Bot calls `POST https://graph.facebook.com/<version>/<phone-number-id>/messages`. On success the delivery becomes `accepted` and stores Meta's message id.
3. Meta calls `POST /webhook` with `sent` / `delivered` / `read` / `failed`. The bot verifies `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the App Secret), forwards to `POST backend/api/v1/internal/whatsapp/statuses`.
4. The backend only moves a status forward, so duplicate or out-of-order webhooks are harmless. A later `failed` marks the reminder `failed` so "Retry failed" appears.

If the backend is down, the bot answers the webhook with 500 and Meta retries later. Known small gap: a status arriving in the few milliseconds before the backend saved the message id is not matched; the next status (`delivered`/`read`) still corrects it.

## Duplicate protection
- Backend: unique `idempotency_key` per reminder + recipient + scheduled instant; job rows are unique per instant.
- Bot: `Idempotency-Key` stored in Redis (or memory) for 7 days; the same key returns the stored message id instead of sending again. A manual retry uses a new job, so it truly re-sends.
