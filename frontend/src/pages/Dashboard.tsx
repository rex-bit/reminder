import { Link, useNavigate } from 'react-router-dom';
import { remindersApi } from '../api/endpoints';
import type { Reminder, ReminderStatus } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { fmtDateTime, longDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Badge, Card, LinkButton } from '../ui/controls';
import { AsyncView, EmptyState } from '../ui/states';
import { t } from '../i18n';

const STAT_ORDER: { key: ReminderStatus; label: string }[] = [
  { key: 'due', label: t('To send') },
  { key: 'pending', label: t('Scheduled') },
  { key: 'sent', label: t('Sent') },
  { key: 'failed', label: t('Failed') },
  { key: 'draft', label: t('Drafts') },
];

function Row({ r }: { r: Reminder }) {
  const nav = useNavigate();
  return (
    <div className="list-item clickable" onClick={() => nav(`/reminders/${r.id}`)} role="link" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && nav(`/reminders/${r.id}`)}>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="title-s">{r.title}</div>
        <div className="body-s muted">
          {r.status === 'sent' && r.sent_at ? t('Sent {when}', { when: fmtDateTime(r.sent_at, r.timezone) }) : longDate(r.reminder_date)}
          {r.status !== 'sent' && r.scheduled_at ? ` · ${fmtDateTime(r.scheduled_at, r.timezone)}` : ''}
        </div>
      </div>
      {r.kind === 'emergency' && <Badge status="emergency">{t('Emergency')}</Badge>}
      <Badge status={r.status} />
    </div>
  );
}

export function DashboardPage() {
  const { admin, can } = useAuth();
  const state = useAsync((s) => remindersApi.stats(s), []);

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1 className="headline-m">{t('Hello, {name}', { name: admin?.display_name.split(' ')[0] ?? '' })}</h1>
          <p className="body-m muted">{t('Reminder overview')}</p>
        </div>
        {can('reminders.send') && (
          <LinkButton to="/reminders/new?kind=emergency" variant="tonal" icon="campaign">
            {t('Emergency announcement')}
          </LinkButton>
        )}
      </div>

      <AsyncView state={state} empty={null}>
        {(d) => (
          <>
            {(d.counts.due ?? 0) > 0 && (
              <Link to="/due" className="banner" style={{ textDecoration: 'none', color: 'inherit' }}>
                <strong>{d.counts.due === 1 ? t('1 reminder waiting to be sent.') : t('{n} reminders waiting to be sent.', { n: d.counts.due })}</strong>
                <span>{t('Open “To send” to share them on WhatsApp.')}</span>
              </Link>
            )}
            <div className="grid cols-auto">
              {STAT_ORDER.map((s) => (
                <Card key={s.key} variant={s.key === 'failed' && d.counts.failed > 0 ? 'tonal-primary' : 'filled'}>
                  <span className="label-l muted">{s.label}</span>
                  <span className="stat">{d.counts[s.key] ?? 0}</span>
                </Card>
              ))}
            </div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
              <Card variant="outlined">
                <div className="row">
                  <h2 className="title-m grow">{t('Next up')}</h2>
                  <Link to="/scheduled">{t('View all')}</Link>
                </div>
                {d.next.length === 0 ? <EmptyState icon="schedule" title={t('Nothing scheduled')} hint={t('Scheduled reminders appear here.')} /> : <div className="list">{d.next.map((r) => <Row key={r.id} r={r} />)}</div>}
              </Card>
              <Card variant="outlined">
                <div className="row">
                  <h2 className="title-m grow">{t('Recent')}</h2>
                  <Link to="/history">{t('History')}</Link>
                </div>
                {d.recent.length === 0 ? <EmptyState icon="history" title={t('No history yet')} hint={t('Sent reminders appear here.')} /> : <div className="list">{d.recent.map((r) => <Row key={r.id} r={r} />)}</div>}
              </Card>
            </div>
          </>
        )}
      </AsyncView>
    </div>
  );
}
