import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { deliveryApi, recipientsApi, remindersApi, settingsApi, templatesApi } from '../api/endpoints';
import { EMPTY_CONTENT, type DeliveryMethod, type Reminder, type ReminderContent, type ReminderInput, type ReminderKind, type Recurrence } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { buildMessage, TIMEZONES, todayIso } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Button, Card, Checkbox, DateField, SelectField, Segmented, Switch, TextArea, TextField } from '../ui/controls';
import { useOverlay } from '../ui/overlay';
import { ErrorState, LoadingList } from '../ui/states';
import { ContentEditor } from '../ui/ContentEditor';
import { ScheduleDialog } from './ScheduleDialog';
import { t } from '../i18n';

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
  const deliveryCfg = useAsync(async (s) => {
    try {
      return await deliveryApi.config(s);
    } catch {
      return null;
    }
  }, []);
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
  const [method, setMethod] = useState<DeliveryMethod>('both');
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
    setMethod(r.delivery_method ?? 'both');
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
    if (!title.trim()) e.title = t('Title is required');
    else if (title.length > 160) e.title = t('Max 160 characters');
    if (!date) e.date = t('Date is required');
    if (recurrence !== 'none' && until && until < date) e.until = t('Must be on or after the reminder date');
    if (forSchedule && method !== 'push' && rids.length === 0) e.recipients = t('Choose at least one recipient to schedule');
    if (custom !== null && !custom.trim()) e.custom = t('Custom message cannot be empty');
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save(forSchedule: boolean) {
    if (!validate(forSchedule)) return;
    const body: ReminderInput = {
      title: title.trim(), kind, reminder_date: date, content, custom_message: custom,
      template_id: templateId || null, timezone: tz, recurrence, recurrence_until: recurrence === 'none' || !until ? null : until, delivery_method: method, recipient_ids: rids,
    };
    setBusy(forSchedule ? 'schedule' : 'draft');
    setFormError(null);
    try {
      const saved = id ? await remindersApi.update(id, body) : await remindersApi.create(body);
      if (forSchedule) setScheduling(saved);
      else {
        notify(t('Draft saved'));
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
    const tpl = templates.data?.find((x) => x.id === tid);
    if (!tpl) return;
    setContent({ ...EMPTY_CONTENT, ...tpl.content });
    setCustom(tpl.message_body ?? null);
    notify(t('Template “{name}” applied', { name: tpl.name }));
  }

  if (id && existing.loading && !existing.data) return <div className="page"><LoadingList /></div>;
  if (id && existing.error) return <div className="page"><ErrorState message={existing.error} onRetry={existing.reload} /></div>;
  if (existing.data && !['draft', 'pending', 'failed'].includes(existing.data.status)) {
    return <div className="page"><div className="banner">{t('This reminder is {status} and can no longer be edited. Duplicate it to make a new one.', { status: existing.data.status })}</div></div>;
  }

  const activeRecipients = (recipients.data ?? []).filter((r) => r.is_active);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="headline-m">{id ? t('Edit reminder') : kind === 'emergency' ? t('Emergency announcement') : t('Create reminder')}</h1>
      </div>
      {formError && <div className="banner error" role="alert">{formError}</div>}

      <div className="split">
        <div className="stack">
          <Card variant="outlined">
            <Segmented<ReminderKind> label={t('Reminder kind')} value={kind} onChange={setKind} options={[{ value: 'daily', label: t('Daily'), icon: 'schedule' }, { value: 'emergency', label: t('Emergency'), icon: 'campaign' }]} />
            <TextField label={t('Title')} value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} maxLength={160} />
            <div className="editor-grid">
              <DateField label={t('Reminder date')} value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
              <SelectField label={t('Timezone')} value={tz} onChange={(e) => setTz(e.target.value)}>
                {(TIMEZONES.includes(tz) ? TIMEZONES : [tz, ...TIMEZONES]).map((z) => <option key={z}>{z}</option>)}
              </SelectField>
            </div>
            {can('templates.read') && (
              <SelectField label={t('Start from template')} value={templateId} onChange={(e) => applyTemplate(e.target.value)} help={t('Replaces the content below')}>
                <option value="">{t('None')}</option>
                {(templates.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </SelectField>
            )}
          </Card>

          <ContentEditor content={content} onChange={setContent} />

          <Card variant="outlined">
            <h3 className="title-m">{t('Delivery method')}</h3>
            <Segmented<DeliveryMethod> label={t('Delivery method')} value={method} onChange={setMethod} options={[{ value: 'whatsapp', label: t('WhatsApp automatic send') }, { value: 'push', label: t('Website push notification') }, { value: 'both', label: t('Both') }]} />
            {method !== 'push' && deliveryCfg.data && !deliveryCfg.data.whatsapp.configured && (
              <div className="banner" role="status">{t('WhatsApp Cloud API is not configured on the server (missing: {vars}). Messages will fail until it is set up.', { vars: deliveryCfg.data.whatsapp.missing.join(', ') })}</div>
            )}
            {method !== 'push' && deliveryCfg.data?.whatsapp.configured && !deliveryCfg.data.whatsapp.template && (
              <div className="banner" role="status">{t('No approved WhatsApp template is set (WHATSAPP_TEMPLATE_NAME). Free-form messages are only delivered to people who messaged your number in the last 24 hours.')}</div>
            )}
            {method !== 'whatsapp' && deliveryCfg.data && !deliveryCfg.data.push.configured && (
              <div className="banner" role="status">{t('Web Push is not configured on the server (VAPID keys). No notification can be sent yet.')}</div>
            )}
            <p className="body-s muted">{method === 'push' ? t('Sent as a notification to every device that enabled notifications. No recipients needed.') : method === 'whatsapp' ? t('Sent automatically through the WhatsApp Business Cloud API at the scheduled time.') : t('Sent through WhatsApp and as a notification at the scheduled time.')}</p>
          </Card>

          {method !== 'push' && <Card variant="outlined">
            <h3 className="title-m">{t('Recipients')}</h3>
            {recipients.loading ? <LoadingList rows={2} /> : recipients.error ? <ErrorState message={recipients.error} onRetry={recipients.reload} /> : activeRecipients.length === 0 ? (
              <p className="body-m muted">{t('No active recipients yet. Add some on the Recipients page.')}</p>
            ) : (
              <div className="perm-group">
                {activeRecipients.map((r) => (
                  <Checkbox key={r.id} checked={rids.includes(r.id)} onChange={(v) => setRids((x) => (v ? [...x, r.id] : x.filter((y) => y !== r.id)))}
                    label={<>{r.name} <span className="body-s muted">· {r.channel === 'manual_share' ? t('you get a notification and send it yourself') : r.type === 'group' ? t('WhatsApp group') : r.phone_e164}</span></>} />
                ))}
              </div>
            )}
            {errors.recipients && <p className="body-s" style={{ color: 'var(--md-error)' }}>{errors.recipients}</p>}
          </Card>}

          <Card variant="outlined">
            <h3 className="title-m">{t('Recurrence')}</h3>
            <div className="editor-grid">
              <SelectField label={t('Repeat')} value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
                <option value="none">{t('Does not repeat')}</option>
                <option value="daily">{t('Daily')}</option>
                <option value="weekly">{t('Weekly')}</option>
                <option value="monthly">{t('Monthly')}</option>
              </SelectField>
              {recurrence !== 'none' && <DateField label={t('Repeat until (optional)')} value={until} onChange={(e) => setUntil(e.target.value)} error={errors.until} />}
            </div>
          </Card>
        </div>

        <div className="stack sticky">
          <Card variant="elevated">
            <div className="row">
              <h3 className="title-m grow">{t('Message preview')}</h3>
              <Switch checked={custom !== null} onChange={(v) => setCustom(v ? generated : null)} label={t('Customize')} />
            </div>
            {custom !== null ? (
              <>
                <TextArea label={t('Message text')} value={custom} onChange={(e) => setCustom(e.target.value)} rows={14} error={errors.custom} help={t('Sent exactly as written. Turn Customize off to regenerate from the fields.')} />
                <Button variant="text" onClick={() => setCustom(generated)}>{t('Reset to generated text')}</Button>
              </>
            ) : (
              <div className="bubble" aria-label={t('Message preview')}>{message}</div>
            )}
            <p className="body-s muted">{t('Preview only. Real delivery status appears after sending.')}</p>
          </Card>
          <div className="row">
            <Button variant="outlined" onClick={() => nav(-1)}>{t('Cancel')}</Button>
            <span className="grow" />
            <Button variant="tonal" loading={busy === 'draft'} disabled={!!busy} onClick={() => save(false)}>{t('Save draft')}</Button>
            {can('schedule.manage') && <Button loading={busy === 'schedule'} disabled={!!busy} icon="schedule" onClick={() => save(true)}>{t('Save & schedule')}</Button>}
          </div>
        </div>
      </div>

      {scheduling && <ScheduleDialog reminder={scheduling} onClose={() => nav(`/reminders/${scheduling.id}`)} onDone={() => nav(`/reminders/${scheduling.id}`)} />}
    </div>
  );
}
