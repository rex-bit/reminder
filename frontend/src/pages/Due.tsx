import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { remindersApi } from '../api/endpoints';
import type { Reminder } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { buildMessage, fmtDateTime, longDate, manualShareUrl } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Badge, Button, Card } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { useOverlay } from '../ui/overlay';
import { AsyncView, EmptyState } from '../ui/states';
import { t } from '../i18n';

function DueCard({ r, onDone }: { r: Reminder; onDone(): void }) {
  const { can } = useAuth();
  const { notify, confirm } = useOverlay();
  const [busy, setBusy] = useState(false);
  const message = buildMessage(r);
  const targets = r.manual_shares.filter((m) => !m.done).map((m) => m.name);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      notify(t('Message copied'));
    } catch {
      notify(t('Could not copy. Select the text and copy it manually.'), { kind: 'error' });
    }
  }

  async function markSent() {
    if (!(await confirm({ title: t('Mark as sent?'), body: t('Confirm that you already sent “{title}” on WhatsApp. This only records it; the system cannot check.', { title: r.title }), confirmLabel: t('Yes, I sent it') }))) return;
    setBusy(true);
    try {
      await remindersApi.markSent(r.id);
      notify(t('Marked as sent'));
      onDone();
    } catch (e) {
      notify(errorMessage(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card variant="elevated">
      <div className="row">
        <div className="grow" style={{ minWidth: 0 }}>
          <Link to={`/reminders/${r.id}`} className="title-m" style={{ textDecoration: 'none' }}>{r.title}</Link>
          <div className="body-s muted">{t('{date} · due {time}', { date: longDate(r.reminder_date), time: fmtDateTime(r.scheduled_at, r.timezone) })}</div>
        </div>
        {r.kind === 'emergency' && <Badge status="emergency">{t('Emergency')}</Badge>}
        <Badge status="due">{t('To send')}</Badge>
      </div>
      <div className="body-m">{t('Send to:')} <strong>{targets.join(', ') || '—'}</strong></div>
      <div className="bubble">{message}</div>
      <div className="row">
        <a className="btn btn-filled" href={manualShareUrl(message)} target="_blank" rel="noopener noreferrer">
          <Icon name="share" size={18} />
          {t('Open WhatsApp')}
        </a>
        <Button variant="outlined" icon="copy" onClick={copy}>{t('Copy text')}</Button>
        {can('reminders.send') && <Button variant="tonal" icon="check" loading={busy} onClick={markSent}>{t('Mark as sent')}</Button>}
      </div>
      <p className="body-s muted">{t('WhatsApp opens with this text. Pick the group, tag everyone if you want, and press send. Then come back and mark it as sent.')}</p>
    </Card>
  );
}

export function DuePage() {
  const state = useAsync((s) => remindersApi.list({ status: 'due', sort: 'scheduled_at', pageSize: 50 }, s), []);
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1 className="headline-m">{t('To send')}</h1>
          <p className="body-m muted">{t('Reminders that reached their time and are waiting for you to send them on WhatsApp.')}</p>
        </div>
        <Button variant="text" icon="refresh" onClick={state.reload}>{t('Refresh')}</Button>
      </div>
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={<EmptyState icon="check" title={t('Nothing to send')} hint={t('You will get a notification when a scheduled reminder is ready.')} />}>
        {(d) => <div className="stack">{d.items.map((r) => <DueCard key={r.id} r={r} onDone={state.reload} />)}</div>}
      </AsyncView>
    </div>
  );
}
