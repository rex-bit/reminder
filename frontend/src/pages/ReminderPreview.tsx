import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { recipientsApi, remindersApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthProvider';
import { buildMessage, fmtDateTime, longDate, manualShareUrl } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Badge, Button, Card } from '../ui/controls';
import { useOverlay } from '../ui/overlay';
import { EmptyState, ErrorState, LoadingList } from '../ui/states';
import { ScheduleDialog } from './ScheduleDialog';
import { t } from '../i18n';

export function ReminderPreviewPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { can } = useAuth();
  const { notify, confirm } = useOverlay();
  const rem = useAsync((s) => remindersApi.get(id, s), [id]);
  const deliveries = useAsync((s) => (can('logs.delivery') ? remindersApi.deliveries(id, s) : Promise.resolve([])), [id]);
  const recipients = useAsync((s) => (can('recipients.read') ? recipientsApi.list(s) : Promise.resolve([])), []);
  const [scheduling, setScheduling] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  if (rem.loading && !rem.data) return <div className="page"><LoadingList rows={3} /></div>;
  if (rem.error || !rem.data) return <div className="page"><ErrorState message={rem.error ?? t('Not found')} onRetry={rem.reload} /></div>;
  const r = rem.data;
  const message = buildMessage(r);
  const names = (recipients.data ?? []).filter((x) => r.recipient_ids.includes(x.id));
  const editable = ['draft', 'pending', 'failed'].includes(r.status);

  async function act(key: string, label: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try {
      await fn();
      notify(label);
      rem.reload();
      deliveries.reload();
    } catch (e) {
      notify(errorMessage(e), { kind: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function sendNow() {
    if (await confirm({ title: t('Send now?'), body: t('This queues “{title}” for immediate delivery to {count} recipient(s). It cannot be recalled.', { title: r.title, count: r.recipient_ids.length }), confirmLabel: t('Send now') })) {
      await act('send', t('Queued for delivery'), () => remindersApi.sendNow(r.id));
    }
  }
  async function remove() {
    if (await confirm({ title: t('Delete reminder?'), body: t('This cannot be undone.'), confirmLabel: t('Delete'), danger: true })) {
      try {
        await remindersApi.remove(r.id);
        notify(t('Reminder deleted'));
        nav('/history');
      } catch (e) {
        notify(errorMessage(e), { kind: 'error' });
      }
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      notify(t('Message copied'));
    } catch {
      notify(t('Could not copy. Select the text and copy it manually.'), { kind: 'error' });
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1 className="headline-m">{r.title}</h1>
          <div className="row" style={{ gap: 8 }}>
            <Badge status={r.status} />
            {r.kind === 'emergency' && <Badge status="emergency">{t('Emergency')}</Badge>}
            <span className="body-m muted">{longDate(r.reminder_date)}</span>
          </div>
        </div>
      </div>

      <div className="row">
        {editable && can('reminders.update') && <Button variant="tonal" icon="edit" onClick={() => nav(`/reminders/${r.id}/edit`)}>{t('Edit')}</Button>}
        {can('schedule.manage') && (r.status === 'draft' || r.status === 'pending') && <Button variant="tonal" icon="schedule" onClick={() => setScheduling(true)}>{r.status === 'pending' ? t('Reschedule') : t('Schedule')}</Button>}
        {can('schedule.manage') && r.status === 'pending' && <Button variant="outlined" icon="cancel" loading={busy === 'cancel'} onClick={() => act('cancel', t('Schedule cancelled'), () => remindersApi.cancel(r.id))}>{t('Cancel schedule')}</Button>}
        {can('reminders.send') && (r.status === 'draft' || r.status === 'pending') && r.recipient_ids.length > 0 && <Button icon="send" loading={busy === 'send'} onClick={sendNow}>{t('Send now')}</Button>}
        {can('reminders.send') && r.status === 'due' && <Button icon="check" loading={busy === 'mark'} onClick={async () => { if (await confirm({ title: t('Mark as sent?'), body: t('Confirm that you sent it on WhatsApp. This only records it.'), confirmLabel: t('Yes, I sent it') })) await act('mark', t('Marked as sent'), () => remindersApi.markSent(r.id)); }}>{t('Mark as sent')}</Button>}
        {can('reminders.send') && r.status === 'failed' && <Button icon="refresh" loading={busy === 'retry'} onClick={() => act('retry', t('Retry queued'), () => remindersApi.retryFailed(r.id))}>{t('Retry failed')}</Button>}
        {can('reminders.create') && <Button variant="outlined" icon="copy" onClick={async () => { try { const c = await remindersApi.duplicate(r.id); notify(t('Duplicated as draft')); nav(`/reminders/${c.id}/edit`); } catch (e) { notify(errorMessage(e), { kind: 'error' }); } }}>{t('Duplicate')}</Button>}
        {can('reminders.delete') && <Button variant="text" danger icon="delete" onClick={remove}>{t('Delete')}</Button>}
      </div>

      <div className="split">
        <div className="stack">
          <Card variant="elevated">
            <h2 className="title-m">{t('Message')}</h2>
            <div className="bubble">{message}</div>
            <div className="row">
              <Button variant="outlined" icon="copy" onClick={copy}>{t('Copy text')}</Button>
              <a className="btn btn-outlined" href={manualShareUrl(message)} target="_blank" rel="noopener noreferrer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11A2.99 2.99 0 1 0 15 5c0 .24.04.47.09.7L8.04 9.81A3 3 0 1 0 6 15c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" /></svg>
                {t('Share manually in WhatsApp')}
              </a>
            </div>
            <p className="body-s muted">{t('Opens WhatsApp with this text; you choose the chat or group and press send yourself. WhatsApp does not tell us whether you sent it, so use “Mark as sent” to record it.')}</p>
          </Card>

          <Card variant="outlined">
            <h2 className="title-m">{t('Delivery')}</h2>
            {!can('logs.delivery') ? <p className="body-m muted">{t('You do not have permission to view delivery logs.')}</p>
              : deliveries.loading && !deliveries.data ? <LoadingList rows={2} />
              : deliveries.error ? <ErrorState message={deliveries.error} onRetry={deliveries.reload} />
              : (deliveries.data ?? []).length === 0 ? <EmptyState icon="mail" title={t('No deliveries yet')} hint={t('Statuses come from WhatsApp webhooks after the message is sent.')} />
              : <div className="list">{(deliveries.data ?? []).map((d) => (
                <div className="list-item" key={d.id}>
                  <div className="grow">
                    <div className="title-s">{d.recipient_name ?? t('Removed recipient')}</div>
                    <div className="body-s muted">{t('Attempt {n} · {time}', { n: d.attempt, time: fmtDateTime(d.sent_at ?? d.created_at, r.timezone) })}</div>
                    {d.error_message && <div className="body-s" style={{ color: 'var(--md-error)' }}>{d.error_code ? `${d.error_code}: ` : ''}{d.error_message}</div>}
                  </div>
                  <Badge status={d.status} />
                </div>))}</div>}
          </Card>
        </div>

        <div className="stack sticky">
          <Card variant="filled">
            <h2 className="title-m">{t('Details')}</h2>
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px' }}>
              <dt className="muted">{t('Send time')}</dt><dd style={{ margin: 0 }}>{fmtDateTime(r.scheduled_at, r.timezone)}</dd>
              <dt className="muted">{t('Timezone')}</dt><dd style={{ margin: 0 }}>{r.timezone}</dd>
              <dt className="muted">{t('Repeats')}</dt><dd style={{ margin: 0 }}>{r.recurrence === 'none' ? t('No') : r.recurrence_until ? t('{recurrence} until {date}', { recurrence: r.recurrence, date: r.recurrence_until }) : r.recurrence}</dd>
              <dt className="muted">{t('Sent at')}</dt><dd style={{ margin: 0 }}>{fmtDateTime(r.sent_at, r.timezone)}</dd>
              <dt className="muted">{t('Recipients')}</dt><dd style={{ margin: 0 }}>{names.length ? names.map((n) => n.name).join(', ') : r.recipient_ids.length ? t('{count} selected', { count: r.recipient_ids.length }) : t('None')}</dd>
            </dl>
          </Card>
        </div>
      </div>

      {scheduling && <ScheduleDialog reminder={r} onClose={() => setScheduling(false)} onDone={() => { setScheduling(false); rem.reload(); }} />}
    </div>
  );
}
