import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { settingsApi } from '../api/endpoints';
import type { AppSettings } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { TIMEZONES } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { SEED_PRESETS } from '../theme/palette';
import { useTheme, type ThemeMode } from '../theme/ThemeProvider';
import { disablePush, enablePush, getPushState, needsHomeScreenInstall, sendTestPush, type PushState } from '../lib/push';
import { Button, Card, SelectField, Segmented, Switch, TextField, TimeField } from '../ui/controls';
import { useOverlay } from '../ui/overlay';
import { AsyncView } from '../ui/states';
import { t } from '../i18n';
import { LanguageSwitch } from '../i18n/LanguageSwitch';

function AppSettingsCard({ initial, canEdit, onSaved }: { initial: AppSettings; canEdit: boolean; onSaved(): void }) {
  const { notify } = useOverlay();
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setS(initial), [initial]);
  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => setS((x) => ({ ...x, [k]: v }));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await settingsApi.save(s);
      notify(t('Settings saved'));
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card variant="outlined">
      <h2 className="title-m">{t('Application')}</h2>
      {error && <div className="banner error" role="alert">{error}</div>}
      <TextField label={t('App name')} value={s['app.name']} onChange={(e) => set('app.name', e.target.value)} disabled={!canEdit} />
      <SelectField label={t('Default timezone')} value={s['app.timezone']} onChange={(e) => set('app.timezone', e.target.value)} disabled={!canEdit} help={t('Used for new reminders and schedule times')}>
        {(TIMEZONES.includes(s['app.timezone']) ? TIMEZONES : [s['app.timezone'], ...TIMEZONES]).map((z) => <option key={z}>{z}</option>)}
      </SelectField>
      <TimeField label={t('Default send time')} value={s['reminder.default_send_time']} onChange={(e) => set('reminder.default_send_time', e.target.value)} disabled={!canEdit} />
      <Switch checked={s['whatsapp.groups_supported']} onChange={(v) => set('whatsapp.groups_supported', v)} disabled={!canEdit} label={t('My WhatsApp business number is eligible for the Groups API')} />
      <p className="body-s muted">{t('Leave this off unless Meta has enabled group messaging for your number. Group recipients otherwise use manual sharing.')}</p>
      <Switch checked={s['public.enabled']} onChange={(v) => set('public.enabled', v)} disabled={!canEdit} label={t('Public class page (anyone with the link can see the schedule, no login)')} />
      <p className="body-s muted">{t('Shows released reminders (uniform, schedule, homework, announcements) and lets students turn on notifications. It never shows recipients, phone numbers or logs.')} <Link to="/home">{t('Open the public page')}</Link></p>
      {canEdit ? <div><Button loading={busy} onClick={save}>{t('Save settings')}</Button></div> : <p className="body-s muted">{t('You can view these settings but not change them.')}</p>}
    </Card>
  );
}

function NotificationsCard() {
  const { notify } = useOverlay();
  const state = useAsync(() => getPushState(), []);
  const [busy, setBusy] = useState(false);
  const label: Record<PushState, string> = {
    unsupported: t('This browser does not support push notifications.'),
    'server-disabled': t('Notifications are not set up on the server yet (VAPID keys missing).'),
    denied: t('Notifications are blocked for this site. Allow them in your browser or phone settings, then reload.'),
    off: t('Off on this device.'),
    on: t('On for this device.'),
  };

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      notify(done);
      state.reload();
    } catch (e) {
      notify(errorMessage(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card variant="outlined">
      <h2 className="title-m">{t('Notifications')}</h2>
      <p className="body-m muted">{t('Get a notification when a reminder is ready to be sent, so you can tap it and share it on WhatsApp.')}</p>
      {needsHomeScreenInstall() && (
        <div className="banner">{t('On iPhone/iPad, first tap Share, then “Add to Home Screen”, and open the app from the Home Screen. Notifications only work from there.')}</div>
      )}
      {state.loading && !state.data ? <div className="spinner" role="status" aria-label={t('Loading')} /> : state.error ? <div className="banner error">{state.error}</div> : (
        <>
          <p className="title-s">{state.data ? label[state.data.state] : ''}</p>
          <div className="row">
            {state.data?.state === 'off' && <Button loading={busy} icon="campaign" onClick={() => run(enablePush, t('Notifications enabled'))}>{t('Enable on this device')}</Button>}
            {state.data?.state === 'on' && (
              <>
                <Button variant="tonal" loading={busy} onClick={() => run(sendTestPush, t('Test notification sent'))}>{t('Send test')}</Button>
                <Button variant="outlined" loading={busy} onClick={() => run(disablePush, t('Notifications turned off'))}>{t('Turn off')}</Button>
              </>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

export function SettingsPage() {
  const { can } = useAuth();
  const { mode, setMode, seed, setSeed } = useTheme();
  const settings = useAsync((s) => (can('settings.read') ? settingsApi.get(s) : Promise.resolve(null)), []);

  return (
    <div className="page">
      <h1 className="headline-m">{t('Settings')}</h1>

      <Card variant="outlined">
        <h2 className="title-m">{t('Appearance')}</h2>
        <p className="body-s muted">{t('Saved on this device.')}</p>
        <LanguageSwitch />
        <Segmented<ThemeMode> label={t('Theme')} value={mode} onChange={setMode} options={[{ value: 'light', label: t('Light') }, { value: 'dark', label: t('Dark') }, { value: 'system', label: t('System') }]} />
        <div>
          <div className="label-l" style={{ marginBottom: 8 }}>{t('Accent color')}</div>
          <div className="row" role="group" aria-label={t('Accent color')}>
            {SEED_PRESETS.map((p) => <button key={p.hex} className="swatch" style={{ background: p.hex }} aria-label={t(p.name)} aria-pressed={seed.toLowerCase() === p.hex} title={t(p.name)} onClick={() => setSeed(p.hex)} />)}
            <label className="row" style={{ gap: 8 }}>
              <input type="color" value={seed} onChange={(e) => setSeed(e.target.value)} aria-label={t('Custom accent color')} style={{ width: 40, height: 40, border: 0, padding: 0, background: 'none' }} />
              <span className="body-s muted">{t('Custom')}</span>
            </label>
          </div>
        </div>
      </Card>

      <NotificationsCard />

      {can('settings.read') && (
        <AsyncView state={settings} empty={null}>
          {(d) => d && <AppSettingsCard initial={d} canEdit={can('settings.update')} onSaved={settings.reload} />}
        </AsyncView>
      )}
    </div>
  );
}
