import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { recipientsApi, remindersApi, settingsApi, templatesApi } from '../api/endpoints';
import { EMPTY_CONTENT, type Reminder, type ReminderContent, type ReminderInput, type ReminderKind, type Recurrence } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { buildMessage, TIMEZONES, todayIso } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Button, Card, Checkbox, DateField, SelectField, Segmented, Switch, TextArea, TextField } from '../ui/controls';
import { useOverlay } from '../ui/overlay';
import { ErrorState, LoadingList } from '../ui/states';
import { ContentEditor } from '../ui/ContentEditor';
import { ScheduleDialog } from './ScheduleDialog';

const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function ReminderFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { can } = useAuth();
  const { notify } = useOverlay();

  const existing = useAsync<Reminder | null>((s) => (id ? remindersApi.get(id, s) : Promise.resolve(null)), [id]);
  const recipients = useAsync((s) => (can('recipients.read') ? recipientsApi.list(s) : Promise.resolve([])), []);
  const templates = useAsync((s) => (can('templates.read') ? templatesApi.list(s) : Promise.resolve([])), []);
  const defaults = useAsync(async (s) => {
    try {
      return await settingsApi.get(s);
    } catch {
      return null;
    }
  }, []);

  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ReminderKind>(params.get('kind') === 'emergency' ? 'emergency' : 'daily');
  const [date, setDate] = useState(todayIso());
  const [content, setContent] = useState<ReminderContent>(EMPTY_CONTENT);
  const [custom, setCustom] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string>('');
  const [tz, setTz] = useState(browserTz);
  const [recurrence, setRecurrence] = useState<Recurrence>('none');
  const [until, setUntil] = useState('');
  const [rids, setRids] = useState<string[]>([]);
  const [busy, setBusy] = useState<'draft' | 'schedule' | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<Reminder | null>(null);

  // Hydrate when editing.
  useEffect(() => {
    const r = existing.data;
    if (!r) return;
    setTitle(r.title);
    setKind(r.kind);
    setDate(r.reminder_date);
    setContent({ ...EMPTY_CONTENT, ...r.content });
    setCustom(r.custom_message);
    setTemplateId(r.template_id ?? '');
    setTz(r.timezone);
    setRecurrence(r.recurrence);
    setUntil(r.recurrence_until ?? '');
    setRids(r.recipient_ids);
  }, [existing.data]);

  // New reminders start from the configured timezone.
  useEffect(() => {
    if (!id && defaults.data?.['app.timezone']) setTz(defaults.data['app.timezone']);
  }, [id, defaults.data]);

  const generated = useMemo(() => buildMessage({ title, kind, reminder_date: date, custom_message: null, content }), [title, kind, date, content]);
  const message = custom !== null ? custom : generated;

  function validate(forSchedule: boolean): boolean {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Title is required';
    else if (title.length > 160) e.title = 'Max 160 characters';
    if (!date) e.date = 'Date is required';
    if (recurrence !== 'none' && until && until < date) e.until = 'Must be on or after the reminder date';
    if (forSchedule && rids.length === 0) e.recipients = 'Choose at least one recipient to schedule';
    if (custom !== null && !custom.trim()) e.custom = 'Custom message cannot be empty';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save(forSchedule: boolean) {
    if (!validate(forSchedule)) return;
    const body: ReminderInput = {
      title: title.trim(), kind, reminder_date: date, content, custom_message: custom,
      template_id: templateId || null, timezone: tz, recurrence, recurrence_until: recurrence === 'none' || !until ? null : until, recipient_ids: rids,
    };
    setBusy(forSchedule ? 'schedule' : 'draft');
    setFormError(null);
    try {
      const saved = id ? await remindersApi.update(id, body) : await remindersApi.create(body);
      if (forSchedule) setScheduling(saved);
      else {
        notify('Draft saved');
        nav(`/reminders/${saved.id}`);
      }
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function applyTemplate(tid: string) {
    setTemplateId(tid);
    const t = templates.data?.find((x) => x.id === tid);
    if (!t) return;
    setContent({ ...EMPTY_CONTENT, ...t.content });
    setCustom(t.message_body ?? null);
    notify(`Template “${t.name}” applied`);
  }

  if (id && existing.loading && !existing.data) return <div className="page"><LoadingList /></div>;
  if (id && existing.error) return <div className="page"><ErrorState message={existing.error} onRetry={existing.reload} /></div>;
  if (existing.data && !['draft', 'pending', 'failed'].includes(existing.data.status)) {
    return <div className="page"><div className="banner">This reminder is {existing.data.status} and can no longer be edited. Duplicate it to make a new one.</div></div>;
  }

  const activeRecipients = (recipients.data ?? []).filter((r) => r.is_active);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="headline-m">{id ? 'Edit reminder' : kind === 'emergency' ? 'Emergency announcement' : 'Create reminder'}</h1>
      </div>
      {formError && <div className="banner error" role="alert">{formError}</div>}

      <div className="split">
        <div className="stack">
          <Card variant="outlined">
            <Segmented<ReminderKind> label="Reminder kind" value={kind} onChange={setKind} options={[{ value: 'daily', label: 'Daily', icon: 'schedule' }, { value: 'emergency', label: 'Emergency', icon: 'campaign' }]} />
            <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} maxLength={160} />
            <div className="editor-grid">
              <DateField label="Reminder date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
              <SelectField label="Timezone" value={tz} onChange={(e) => setTz(e.target.value)}>
                {(TIMEZONES.includes(tz) ? TIMEZONES : [tz, ...TIMEZONES]).map((z) => <option key={z}>{z}</option>)}
              </SelectField>
            </div>
            {can('templates.read') && (
              <SelectField label="Start from template" value={templateId} onChange={(e) => applyTemplate(e.target.value)} help="Replaces the content below">
                <option value="">None</option>
                {(templates.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </SelectField>
            )}
          </Card>

          <ContentEditor content={content} onChange={setContent} />

          <Card variant="outlined">
            <h3 className="title-m">Recipients</h3>
            {recipients.loading ? <LoadingList rows={2} /> : recipients.error ? <ErrorState message={recipients.error} onRetry={recipients.reload} /> : activeRecipients.length === 0 ? (
              <p className="body-m muted">No active recipients yet. Add some on the Recipients page.</p>
            ) : (
              <div className="perm-group">
                {activeRecipients.map((r) => (
                  <Checkbox key={r.id} checked={rids.includes(r.id)} onChange={(v) => setRids((x) => (v ? [...x, r.id] : x.filter((y) => y !== r.id)))}
                    label={<>{r.name} <span className="body-s muted">· {r.channel === 'manual_share' ? 'manual share (you send it yourself)' : r.type === 'group' ? 'WhatsApp group' : r.phone_e164}</span></>} />
                ))}
              </div>
            )}
            {errors.recipients && <p className="body-s" style={{ color: 'var(--md-error)' }}>{errors.recipients}</p>}
          </Card>

          <Card variant="outlined">
            <h3 className="title-m">Recurrence</h3>
            <div className="editor-grid">
              <SelectField label="Repeat" value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </SelectField>
              {recurrence !== 'none' && <DateField label="Repeat until (optional)" value={until} onChange={(e) => setUntil(e.target.value)} error={errors.until} />}
            </div>
          </Card>
        </div>

        <div className="stack sticky">
          <Card variant="elevated">
            <div className="row">
              <h3 className="title-m grow">Message preview</h3>
              <Switch checked={custom !== null} onChange={(v) => setCustom(v ? generated : null)} label="Customize" />
            </div>
            {custom !== null ? (
              <>
                <TextArea label="Message text" value={custom} onChange={(e) => setCustom(e.target.value)} rows={14} error={errors.custom} help="Sent exactly as written. Turn Customize off to regenerate from the fields." />
                <Button variant="text" onClick={() => setCustom(generated)}>Reset to generated text</Button>
              </>
            ) : (
              <div className="bubble" aria-label="Message preview">{message}</div>
            )}
            <p className="body-s muted">Preview only. Real delivery status appears after sending.</p>
          </Card>
          <div className="row">
            <Button variant="outlined" onClick={() => nav(-1)}>Cancel</Button>
            <span className="grow" />
            <Button variant="tonal" loading={busy === 'draft'} disabled={!!busy} onClick={() => save(false)}>Save draft</Button>
            {can('schedule.manage') && <Button loading={busy === 'schedule'} disabled={!!busy} icon="schedule" onClick={() => save(true)}>Save &amp; schedule</Button>}
          </div>
        </div>
      </div>

      {scheduling && <ScheduleDialog reminder={scheduling} onClose={() => nav(`/reminders/${scheduling.id}`)} onDone={() => nav(`/reminders/${scheduling.id}`)} />}
    </div>
  );
}
