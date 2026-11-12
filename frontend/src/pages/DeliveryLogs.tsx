import { useState } from 'react';
import { t } from '../i18n';
import { logsApi } from '../api/endpoints';
import type { DeliveryStatus } from '../api/types';
import { fmtDateTime } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { downloadCsv, fetchAllPages } from '../lib/csv';
import { errorMessage } from '../api/client';
import { Badge, Button, FilterChip } from '../ui/controls';
import { useOverlay } from '../ui/overlay';
import { Pager } from '../ui/Pager';
import { AsyncView, EmptyState } from '../ui/states';

const STATUSES: DeliveryStatus[] = ['queued', 'accepted', 'sent', 'delivered', 'read', 'failed'];

export function DeliveryLogsPage() {
  const [status, setStatus] = useState<DeliveryStatus | null>(null);
  const [page, setPage] = useState(1);
  const state = useAsync((s) => logsApi.delivery({ status, page, pageSize: 25 }, s), [status, page]);
  const { notify } = useOverlay();
  const [exporting, setExporting] = useState(false);
  async function exportCsv() {
    setExporting(true);
    try {
      const all = await fetchAllPages((p) => logsApi.delivery({ status, page: p, pageSize: 100 }));
      downloadCsv(`log-pengiriman-${new Date().toISOString().slice(0, 10)}.csv`, ['Reminder', 'Penerima', 'Status', 'Percobaan', 'Dibuat', 'Terkirim', 'Dibaca', 'Kode error', 'Error'],
        all.map((l) => [l.reminder_title, l.recipient_name, l.status, l.attempt, l.created_at, l.sent_at, l.read_at, l.error_code, l.error_message]));
      notify(t('Exported {n} rows', { n: all.length }));
    } catch (e) {
      notify(errorMessage(e), { kind: 'error' });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="headline-m">{t('Delivery logs')}</h1>
        <Button variant="outlined" icon="share" loading={exporting} onClick={exportCsv}>{t('Export CSV')}</Button>
      </div>
      <p className="body-m muted">{t('Statuses are recorded from the WhatsApp Cloud API responses and webhooks. Nothing here is simulated.')}</p>
      <div className="chips" role="group" aria-label={t('Status filter')}>
        {STATUSES.map((s) => <FilterChip key={s} selected={status === s} onClick={() => { setStatus(status === s ? null : s); setPage(1); }}>{s}</FilterChip>)}
      </div>
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={<EmptyState icon="mail" title={t('No delivery logs')} hint={status ? t('No logs with this status.') : t('Logs appear after reminders are sent.')} />}>
        {(d) => (
          <>
            <div className="table-wrap">
              <table className="rt">
                <thead><tr><th>{t('Reminder')}</th><th>{t('Recipient')}</th><th>{t('Status')}</th><th>{t('Attempt')}</th><th>{t('Time')}</th><th>{t('Error')}</th></tr></thead>
                <tbody>
                  {d.items.map((l) => (
                    <tr key={l.id}>
                      <td><a href={`#/reminders/${l.reminder_id}`}>{l.reminder_title ?? l.reminder_id.slice(0, 8)}</a></td>
                      <td data-label={t('Recipient')}>{l.recipient_name ?? '—'}</td>
                      <td data-label={t('Status')}><Badge status={l.status} /></td>
                      <td data-label={t('Attempt')}>{l.attempt}</td>
                      <td data-label={t('Time')}>{fmtDateTime(l.read_at ?? l.delivered_at ?? l.sent_at ?? l.created_at)}</td>
                      <td className="body-s" data-label={t('Error')} style={{ color: l.error_message ? 'var(--md-error)' : undefined }}>{l.error_message ? `${l.error_code ?? ''} ${l.error_message}` : '—'}</td>
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
