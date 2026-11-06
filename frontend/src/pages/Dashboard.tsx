import { Link, useNavigate } from 'react-router-dom';
import { remindersApi } from '../api/endpoints';
import type { Reminder, ReminderStatus } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { fmtDateTime, longDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Badge, Card, LinkButton } from '../ui/controls';
import { AsyncView, EmptyState } from '../ui/states';

const STAT_ORDER: { key: ReminderStatus; label: string }[] = [
  { key: 'pending', label: 'Scheduled' },
  { key: 'sent', label: 'Sent' },
  { key: 'failed', label: 'Failed' },
  { key: 'draft', label: 'Drafts' },
];

function Row({ r }: { r: Reminder }) {
  const nav = useNavigate();
  return (
    <div className="list-item clickable" onClick={() => nav(`/reminders/${r.id}`)} role="link" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && nav(`/reminders/${r.id}`)}>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="title-s">{r.title}</div>
        <div className="body-s muted">
          {longDate(r.reminder_date)}
          {r.scheduled_at ? ` · ${fmtDateTime(r.scheduled_at, r.timezone)}` : ''}
        </div>
      </div>
      {r.kind === 'emergency' && <Badge status="emergency">Emergency</Badge>}
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
          <h1 className="headline-m">Hello, {admin?.display_name.split(' ')[0]}</h1>
          <p className="body-m muted">Reminder overview</p>
        </div>
        {can('reminders.send') && (
          <LinkButton to="/reminders/new?kind=emergency" variant="tonal" icon="campaign">
            Emergency announcement
          </LinkButton>
        )}
      </div>

      <AsyncView state={state} empty={null}>
        {(d) => (
          <>
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
                  <h2 className="title-m grow">Next up</h2>
                  <Link to="/scheduled">View all</Link>
                </div>
                {d.next.length === 0 ? <EmptyState icon="schedule" title="Nothing scheduled" hint="Scheduled reminders appear here." /> : <div className="list">{d.next.map((r) => <Row key={r.id} r={r} />)}</div>}
              </Card>
              <Card variant="outlined">
                <div className="row">
                  <h2 className="title-m grow">Recent</h2>
                  <Link to="/history">History</Link>
                </div>
                {d.recent.length === 0 ? <EmptyState icon="history" title="No history yet" hint="Sent reminders appear here." /> : <div className="list">{d.recent.map((r) => <Row key={r.id} r={r} />)}</div>}
              </Card>
            </div>
          </>
        )}
      </AsyncView>
    </div>
  );
}
