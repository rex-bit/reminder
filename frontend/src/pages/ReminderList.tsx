import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { remindersApi } from '../api/endpoints';
import type { Reminder, ReminderKind, ReminderStatus } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { fmtDateTime, longDate } from '../lib/format';
import { useAsync, useDebounced } from '../lib/useAsync';
import { Badge, Button, FilterChip, IconButton, LinkButton, Segmented, TextField } from '../ui/controls';
import { useOverlay } from '../ui/overlay';
import { AsyncView, EmptyState } from '../ui/states';
import { ScheduleDialog } from './ScheduleDialog';
import { t } from '../i18n';

const MODES = {
  scheduled: { title: t('Scheduled reminders'), statuses: ['pending', 'due', 'failed', 'draft'] as ReminderStatus[], emptyIcon: 'schedule' as const, empty: t('No scheduled reminders'), hint: t('Create a reminder and schedule it to see it here.') },
  history: { title: t('Reminder history'), statuses: ['sent', 'failed', 'cancelled'] as ReminderStatus[], emptyIcon: 'history' as const, empty: t('No history yet'), hint: t('Reminders that were sent, failed or cancelled appear here.') },
};

const LABEL: Record<ReminderStatus, string> = { pending: t('Scheduled'), due: t('To send'), failed: t('Failed'), draft: t('Draft'), sent: t('Sent'), cancelled: t('Cancelled') };

export function ReminderListPage({ mode }: { mode: 'scheduled' | 'history' }) {
  const cfg = MODES[mode];
  const nav = useNavigate();
  const { can } = useAuth();
  const { notify, confirm } = useOverlay();
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<ReminderStatus[]>([]);
  const [kind, setKind] = useState<'all' | ReminderKind>('all');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const dq = useDebounced(q);
  const statuses = (selected.length ? selected : cfg.statuses).join(',');

  const state = useAsync((s) => remindersApi.list({ status: statuses, kind: kind === 'all' ? undefined : kind, q: dq, page, pageSize: 20, sort: mode === 'scheduled' ? 'scheduled_at' : '-updated_at' }, s), [statuses, kind, dq, page, mode]);

  const toggle = (s: ReminderStatus) => {
    setPage(1);
    setSelected((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]));
  };

  async function run(label: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      notify(label);
      state.reload();
    } catch (e) {
      notify(errorMessage(e), { kind: 'error' });
    }
  }

  async function cancel(r: Reminder) {
    if (await confirm({ title: t('Cancel scheduled reminder?'), body: t('“{title}” will not be sent. You can schedule it again later.', { title: r.title }), confirmLabel: t('Cancel reminder'), danger: true })) {
      await run(t('Reminder cancelled'), () => remindersApi.cancel(r.id));
    }
  }
  async function remove(r: Reminder) {
    if (await confirm({ title: t('Delete reminder?'), body: t('“{title}” will be deleted. Its delivery logs are kept for auditing.', { title: r.title }), confirmLabel: t('Delete'), danger: true })) {
      await run(t('Reminder deleted'), () => remindersApi.remove(r.id));
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="headline-m">{cfg.title}</h1>
        {can('reminders.create') && <LinkButton to="/reminders/new" icon="add">{t('New reminder')}</LinkButton>}
      </div>

      <div className="row">
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <TextField label={t('Search title')} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        <Segmented label={t('Kind')} value={kind} onChange={(v) => { setKind(v); setPage(1); }} options={[{ value: 'all', label: t('All') }, { value: 'daily', label: t('Daily') }, { value: 'emergency', label: t('Emergency') }]} />
      </div>
      <div className="chips" role="group" aria-label={t('Status filter')}>
        {cfg.statuses.map((s) => (
          <FilterChip key={s} selected={selected.includes(s)} onClick={() => toggle(s)}>
            {LABEL[s]}
          </FilterChip>
        ))}
      </div>

      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={<EmptyState icon={cfg.emptyIcon} title={q || selected.length || kind !== 'all' ? t('No matching reminders') : cfg.empty} hint={q || selected.length || kind !== 'all' ? t('Try changing the filters.') : cfg.hint} />}>
        {(d) => (
          <>
            <div className="table-wrap">
              <table className="rt">
                <thead>
                  <tr>
                    <th>{t('Title')}</th>
                    <th>{t('Date')}</th>
                    <th>{mode === 'scheduled' ? t('Send time') : t('Sent at')}</th>
                    <th>{t('Status')}</th>
                    <th aria-label={t('Actions')} />
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <a href={`#/reminders/${r.id}`} className="title-s" style={{ textDecoration: 'none' }}>{r.title}</a>
                        <div className="row" style={{ gap: 6 }}>
                          {r.kind === 'emergency' && <Badge status="emergency">{t('Emergency')}</Badge>}
                          {r.recurrence !== 'none' && <span className="body-s muted">{t('Repeats {recurrence}', { recurrence: t(r.recurrence) })}</span>}
                        </div>
                      </td>
                      <td data-label="Tanggal">{longDate(r.reminder_date)}</td>
                      <td data-label={mode === 'scheduled' ? 'Kirim' : 'Terkirim'}>{fmtDateTime(mode === 'scheduled' ? r.scheduled_at : r.sent_at ?? r.scheduled_at, r.timezone)}</td>
                      <td><Badge status={r.status}>{LABEL[r.status]}</Badge></td>
                      <td>
                        <div className="row" style={{ gap: 0, flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                          <IconButton icon="visibility" label={t('Open')} onClick={() => nav(`/reminders/${r.id}`)} />
                          {can('schedule.manage') && (r.status === 'pending' || r.status === 'draft') && <IconButton icon="schedule" label={r.status === 'pending' ? t('Reschedule') : t('Schedule')} onClick={() => setEditing(r)} />}
                          {can('schedule.manage') && r.status === 'pending' && <IconButton icon="cancel" label={t('Cancel schedule')} onClick={() => cancel(r)} />}
                          {can('reminders.send') && r.status === 'failed' && <IconButton icon="refresh" label={t('Retry failed deliveries')} onClick={() => run(t('Retry queued'), () => remindersApi.retryFailed(r.id))} />}
                          {can('reminders.create') && <IconButton icon="copy" label={t('Duplicate')} onClick={async () => { try { const c = await remindersApi.duplicate(r.id); notify(t('Duplicated as draft')); nav(`/reminders/${c.id}/edit`); } catch (e) { notify(errorMessage(e), { kind: 'error' }); } }} />}
                          {can('reminders.delete') && <IconButton icon="delete" label={t('Delete')} onClick={() => remove(r)} />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <span className="body-s muted">{t('{n} total · page {page} of {pages}', { n: d.total, page: d.page, pages: Math.max(1, Math.ceil(d.total / d.pageSize)) })}</span>
              <Button variant="outlined" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t('Previous')}</Button>
              <Button variant="outlined" disabled={page * d.pageSize >= d.total} onClick={() => setPage((p) => p + 1)}>{t('Next')}</Button>
            </div>
          </>
        )}
      </AsyncView>

      {editing && <ScheduleDialog reminder={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); state.reload(); }} />}
    </div>
  );
}
