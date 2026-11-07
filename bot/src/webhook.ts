import type { StatusUpdate } from './backend';

interface WaStatus {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
}
interface WaPayload {
  object?: string;
  entry?: { changes?: { field?: string; value?: { statuses?: WaStatus[] } }[] }[];
}

const KNOWN = new Set(['sent', 'delivered', 'read', 'failed']);

/** Extracts status events from a Cloud API webhook body. Incoming user messages are intentionally ignored. */
export function extractStatuses(payload: WaPayload): StatusUpdate[] {
  const out: StatusUpdate[] = [];
  if (payload.object !== 'whatsapp_business_account') return out;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;
      for (const s of change.value?.statuses ?? []) {
        if (!s.id || !s.status || !KNOWN.has(s.status)) continue;
        const err = s.errors?.[0];
        out.push({
          waMessageId: s.id,
          status: s.status as StatusUpdate['status'],
          timestamp: new Date(Number(s.timestamp ?? Date.now() / 1000) * 1000).toISOString(),
          recipientId: s.recipient_id,
          errorCode: err?.code !== undefined ? String(err.code) : undefined,
          errorMessage: err ? (err.error_data?.details ?? err.message ?? err.title)?.slice(0, 500) : undefined,
        });
      }
    }
  }
  return out;
}
