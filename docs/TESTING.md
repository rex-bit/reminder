# Testing checklist

Legend: ✅ run during development (see notes) · ☐ run it yourself after deploying.

## Automated
- ✅ `backend/src/rbac/permissions.test.ts`, `backend/src/lib/time.test.ts`, `bot/src/security.test.ts` (`npm test`). Their logic was executed with `tsx`; run `npm test` once after `npm install`.
- ✅ SQL used by the scheduler, deliveries, status webhooks and manual tasks was executed on PostgreSQL 16 (migrations 001+002).

## Authentication
- ☐ Wrong password 5 times locks the account for 15 minutes; right password afterwards still fails until the lock expires.
- ☐ First Owner login forces a password change; other pages are blocked until done.
- ☐ Reload keeps you signed in (refresh cookie); sign out on one device invalidates others after a password change.
- ☐ Disabled admin is signed out immediately.

## Permissions
- ☐ New admin has default permissions only; cannot open Admins/Settings pages (UI shows "No access") and API returns 403.
- ☐ An admin cannot grant a permission they do not hold; cannot edit or delete the Owner; cannot delete themselves.
- ☐ Owner grants `templates.manage` -> admin can edit templates without re-login.

## Scheduling
- ☐ Schedule 2 minutes ahead with a manual-share recipient -> status becomes **To send** and a notification arrives.
- ☐ Reschedule and cancel: the old time never fires (check `scheduled_jobs` shows `cancelled`).
- ☐ Restart the API during the wait: the reminder still fires. Stop Redis, schedule, start Redis: it still fires (reconcile within a minute).
- ☐ Daily recurrence creates tomorrow's reminder after the first one fires.
- ☐ Timezone: schedule 06:00 in `Asia/Kuala_Lumpur`; the list shows 06:00 there and the notification arrives at that time.

## Duplicate delivery
- ☐ Press "Send now" twice quickly: one job, one delivery per recipient (`SELECT count(*) FROM delivery_logs WHERE reminder_id=…`).
- ☐ Call `POST /reminders/:id/send` twice with curl: second call returns 409 or reuses the same job.
- ☐ Replay the same webhook payload twice: the delivery status does not move backwards or change.
- ☐ Bot: send the same `Idempotency-Key` twice: second response has `"duplicate": true` and no second message.

## WhatsApp (only if you use the Cloud API)
- ☐ Webhook verification succeeds in Meta's dashboard; a request with a bad signature gets 401.
- ☐ Send to your own number inside the 24-hour window: delivery goes accepted -> sent -> delivered -> read.
- ☐ Outside the window without a template: delivery shows Meta's error in Delivery logs (no fake success).
- ☐ Group recipient with groups disabled fails with `groups_not_supported`.

## Manual sharing and notifications
- ☐ Settings > Notifications > Enable, then Send test. Android: notification shows; tap opens the app.
- ☐ iPhone: Add to Home Screen first, then Enable.
- ☐ To send > Open WhatsApp opens with the prefilled text; Mark as sent moves it to History.

## Responsive UI
- ☐ 360px phone: bottom bar (To send, Scheduled, History, More), no horizontal scroll, FAB not covering buttons.
- ☐ 768px tablet: navigation rail. 1280px desktop: expanded rail.
- ☐ Light, dark and system themes persist after reload; accent color change updates all pages.
- ☐ Every page shows loading, empty and error states (stop the API to see errors).

## Public class page
- ☐ With `public.enabled` off, `/#/` shows "Halaman belum aktif" and `GET /public/feed` returns 404.
- ☐ Turn it on in Settings: logged-out visitors see `/#/` with today's, upcoming and previous reminders; drafts never appear.
- ☐ The page and `/public/feed` contain no recipients, phone numbers or admin names.
- ☐ Enable notifications as a visitor; schedule a manual-share reminder 2 minutes ahead: the page shows nothing yet. Press Mark as sent: only now the notification arrives and the reminder appears.
- ☐ A device that is also an admin device gets one notification, not two.
- ☐ An emergency announcement is pinned on top for 3 days.
- ☐ Logged out, open `/#/admins` or `/#/reminders`: you see "Kamu tidak punya akses", not a login form. `/#/login` shows the form. Calling any panel API without a token returns 401.

## Language
- ☐ Default is Indonesian. On Login, Settings and the public page, the "Bahasa / Language" switch changes to English and back (the page reloads; the choice is saved on that device).
- ☐ Click through every admin page in Indonesian: no half-translated labels. Messages that come from the server (some error texts) stay in English.
