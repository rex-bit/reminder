import { useState } from 'react';
import { logsApi } from '../api/endpoints';
import type { DeliveryStatus } from '../api/types';
import { fmtDateTime } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Badge, FilterChip } from '../ui/controls';
import { Pager } from '../ui/Pager';
import { AsyncView, EmptyState } from '../ui/states';

const STATUSES: DeliveryStatus[] = ['queued', 'accepted', 'sent', 'delivered', 'read', 'failed'];

export function DeliveryLogsPage() {
  const [status, setStatus] = useState<DeliveryStatus | null>(null);
  const [page, setPage] = useState(1);
  const state = useAsync((s) => logsApi.delivery({ status, page, pageSize: 25 }, s), [status, page]);

  return (
    <div className="page">
      <h1 className="headline-m">Delivery logs</h1>
      <p className="body-m muted">Statuses are recorded from the WhatsApp Cloud API responses and webhooks. Nothing here is simulated.</p>
      <div className="chips" role="group" aria-label="Status filter">
        {STATUSES.map((s) => <FilterChip key={s} selected={status === s} onClick={() => { setStatus(status === s ? null : s); setPage(1); }}>{s}</FilterChip>)}
      </div>
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={<EmptyState icon="mail" title="No delivery logs" hint={status ? 'No logs with this status.' : 'Logs appear after reminders are sent.'} />}>
        {(d) => (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Reminder</th><th>Recipient</th><th>Status</th><th>Attempt</th><th>Time</th><th>Error</th></tr></thead>
                <tbody>
                  {d.items.map((l) => (
                    <tr key={l.id}>
                      <td><a href={`#/reminders/${l.reminder_id}`}>{l.reminder_title ?? l.reminder_id.slice(0, 8)}</a></td>
                      <td>{l.recipient_name ?? '—'}</td>
                      <td><Badge status={l.status} /></td>
                      <td>{l.attempt}</td>
                      <td>{fmtDateTime(l.read_at ?? l.delivered_at ?? l.sent_at ?? l.created_at)}</td>
                      <td className="body-s" style={{ color: l.error_message ? 'var(--md-error)' : undefined }}>{l.error_message ? `${l.error_code ?? ''} ${l.error_message}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </AsyncView>
    </div>
  );
}
