import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { remindersApi } from '../api/endpoints';
import type { Reminder, ReminderKind, ReminderStatus } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { downloadCsv, fetchAllPages } from '../lib/csv';
import { fmtDateTime, longDate } from '../lib/format';
import { useAsync, useDebounced } from '../lib/useAsync';
import { Badge, Button, FilterChip, IconButton, LinkButton, Segmented, TextField } from '../ui/controls';
import { Icon, type IconName } from '../ui/Icon';
import { useOverlay } from '../ui/overlay';
import { AsyncView, EmptyState } from '../ui/states';
import { SwipeRow } from '../ui/SwipeRow';
import { ScheduleDialog } from './ScheduleDialog';
import { t } from '../i18n';

const MODES = {
  scheduled: { title: t('Scheduled reminders'), statuses: ['pending', 'due', 'failed', 'draft'] as ReminderStatus[], emptyIcon: 'schedule' as const, empty: t('No scheduled reminders'), hint: t('Create a reminder and schedule it to see it here.') },
  history: { title: t('Reminder history'), statuses: ['sent', 'failed', 'cancelled'] as ReminderStatus[], emptyIcon: 'history' as const, empty: t('No history yet'), hint: t('Reminders that were sent, failed or cancelled appear here.') },
};

const LABEL: Record<ReminderStatus, string> = { pending: t('Scheduled'), due: t('To send'), failed: t('Failed'), draft: t('Draft'), sent: t('Sent'), cancelled: t('Cancelled') };

const STATUS_ICON: Record<ReminderStatus, IconName> = { pending: 'schedule', due: 'send', failed: 'warning', draft: 'edit', sent: 'check', cancelled: 'cancel' };
const METHOD_LABEL = { whatsapp: 'WhatsApp', push: 'Push', both: 'WhatsApp + Push' } as const;

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

  async function duplicate(r: Reminder) {
    try {
      const c = await remindersApi.duplicate(r.id);
      notify(t('Duplicated as draft'));
      nav(`/reminders/${c.id}/edit?dup=1`);
    } catch (e) {
      notify(errorMessage(e), { kind: 'error' });
    }
  }

  const [exporting, setExporting] = useState(false);
  async function exportCsv() {
    setExporting(true);
    try {
      const all = await fetchAllPages((p) => remindersApi.list({ status: statuses, kind: kind === 'all' ? undefined : kind, q: dq, page: p, pageSize: 100, sort: mode === 'scheduled' ? 'scheduled_at' : '-updated_at' }));
      downloadCsv(`reminder-${mode}-${new Date().toISOString().slice(0, 10)}.csv`, ['Judul', 'Jenis', 'Status', 'Tanggal reminder', 'Waktu kirim', 'Terkirim', 'Metode', 'Ulangi'],
        all.map((r) => [r.title, r.kind, r.status, r.reminder_date, r.scheduled_at, r.sent_at, r.delivery_method, r.recurrence]));
      notify(t('Exported {n} rows', { n: all.length }));
    } catch (e) {
      notify(errorMessage(e), { kind: 'error' });
    } finally {
      setExporting(false);
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
        <Button variant="outlined" icon="share" loading={exporting} onClick={exportCsv}>{t('Export CSV')}</Button>
        {can('reminders.create') && <LinkButton to="/reminders/new" icon="add" className="hide-mobile">{t('New reminder')}</LinkButton>}
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
            <div className="rlist">
              {d.items.map((r) => {
                const emergency = r.kind === 'emergency';
                const when = fmtDateTime(mode === 'scheduled' ? r.scheduled_at : r.sent_at ?? r.scheduled_at, r.timezone);
                const go = () => nav(`/reminders/${r.id}`);
                return (
                  <SwipeRow key={r.id} tray={{(can('reminders.create') || can('reminders.delete')) ? (<>
                      {can('reminders.create') && <button type="button" onClick={() => duplicate(r)}><Icon name="copy" size={20} />{t('Duplicate')}</button>}
                      {can('reminders.delete') && <button type="button" className="danger" onClick={() => remove(r)}><Icon name="delete" size={20} />{t('Delete')}</button>}
                    </>) : null}}>
                  <article className={`rcard s-${r.status}${emergency ? ' emergency' : ''}`} role="link" tabIndex={0} onClick={go} onKeyDown={(e) => e.target === e.currentTarget && e.key === 'Enter' && go()}>
                    <span className="rcard-icon"><Icon name={emergency ? 'campaign' : STATUS_ICON[r.status]} /></span>
                    <div className="rcard-main">
                      <span className="rcard-title">{r.title}</span>
                      <div className="rcard-meta">
                        <span>{longDate(r.reminder_date)}</span>
                        {when !== '—' && <span>{mode === 'scheduled' ? t('Send time') : t('Sent at')}: {when}</span>}
                      </div>
                      <div className="rcard-chips">
                        <Badge status={r.status}>{LABEL[r.status]}</Badge>
                        {emergency && <Badge status="emergency">{t('Emergency')}</Badge>}
                        {r.recurrence !== 'none' && <span className="badge">{t('Repeats {recurrence}', { recurrence: t(r.recurrence) })}</span>}
                        {r.delivery_method && r.delivery_method !== 'both' && <span className="badge">{METHOD_LABEL[r.delivery_method]}</span>}
                      </div>
                    </div>
                    <div className="rcard-actions" onClick={(e) => e.stopPropagation()}>
                      {can('schedule.manage') && (r.status === 'pending' || r.status === 'draft') && <IconButton icon="schedule" label={r.status === 'pending' ? t('Reschedule') : t('Schedule')} onClick={() => setEditing(r)} />}
                      {can('schedule.manage') && r.status === 'pending' && <IconButton icon="cancel" label={t('Cancel schedule')} onClick={() => cancel(r)} />}
                      {can('reminders.send') && r.status === 'failed' && <IconButton icon="refresh" label={t('Retry failed deliveries')} onClick={() => run(t('Retry queued'), () => remindersApi.retryFailed(r.id))} />}
                      {can('reminders.create') && <IconButton icon="copy" label={t('Duplicate')} onClick={() => duplicate(r)} className="swipe-dup" />}
                      {can('reminders.delete') && <IconButton icon="delete" label={t('Delete')} onClick={() => remove(r)} className="swipe-del" />}
                    </div>
                  </article>
                  </SwipeRow>
                );
              })}
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
