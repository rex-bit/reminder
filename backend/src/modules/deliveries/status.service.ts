import { query, withTx } from '../../db/pool';
import type { StatusEvent } from '../../lib/whatsapp';
import { logActivity } from '../activity/activity.service';

export type { StatusEvent };

/**
 * Applies WhatsApp delivery statuses. Webhooks are at-least-once and can arrive out of order, so a status only moves
 * forward (accepted < sent < delivered < read) and re-applying an event changes nothing. `failed` wins unless already read.
 * Returns how many rows actually changed.
 */
export async function applyStatuses(statuses: StatusEvent[]): Promise<number> {
  let applied = 0;
  await withTx(async (db) => {
    for (const s of statuses) {
      const upd = await query<{ reminder_id: string }>(
        `UPDATE delivery_logs SET
           status = $2::delivery_status,
           sent_at      = CASE WHEN $2 IN ('sent','delivered','read') THEN COALESCE(sent_at, $3::timestamptz) ELSE sent_at END,
           delivered_at = CASE WHEN $2 IN ('delivered','read')        THEN COALESCE(delivered_at, $3::timestamptz) ELSE delivered_at END,
           read_at      = CASE WHEN $2 = 'read'                       THEN COALESCE(read_at, $3::timestamptz) ELSE read_at END,
           error_code    = CASE WHEN $2 = 'failed' THEN $4 ELSE NULL END,
           error_message = CASE WHEN $2 = 'failed' THEN $5 ELSE NULL END
         WHERE wa_message_id = $1
           AND (
             ($2 = 'failed' AND status IN ('queued','accepted','sent','delivered'))
             OR array_position(ARRAY['queued','accepted','sent','delivered','read'], status::text)
                < array_position(ARRAY['queued','accepted','sent','delivered','read'], $2)
           )
         RETURNING reminder_id`,
        [s.waMessageId, s.status, s.timestamp, s.errorCode ?? null, s.errorMessage ?? null],
        db,
      );
      const row = upd.rows[0];
      if (!row) continue;
      applied++;
      if (s.status === 'failed') {
        // Accepted by the API but failed later: surface it and make "Retry failed" available.
        await query(`UPDATE reminders SET status = 'failed' WHERE id = $1 AND status = 'sent'`, [row.reminder_id], db);
        await logActivity({ action: 'delivery.failed', entityType: 'reminder', entityId: row.reminder_id, metadata: { code: s.errorCode, waMessageId: s.waMessageId } }, undefined, db);
      }
    }
  });
  return applied;
}
