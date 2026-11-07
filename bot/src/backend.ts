import { config } from './config';

export interface StatusUpdate {
  waMessageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string; // ISO
  recipientId?: string;
  errorCode?: string;
  errorMessage?: string;
}

/** Forwards verified delivery statuses to the backend. Throws on failure so the webhook returns 5xx and Meta retries. */
export async function forwardStatuses(statuses: StatusUpdate[]): Promise<void> {
  if (statuses.length === 0) return;
  const res = await fetch(`${config.BACKEND_URL.replace(/\/$/, '')}/api/v1/internal/whatsapp/statuses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': config.BOT_API_KEY },
    body: JSON.stringify({ statuses }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`Backend responded ${res.status}`);
}
