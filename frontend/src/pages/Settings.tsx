import { useEffect, useState } from 'react';
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
      notify('Settings saved');
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card variant="outlined">
      <h2 className="title-m">Application</h2>
      {error && <div className="banner error" role="alert">{error}</div>}
      <TextField label="App name" value={s['app.name']} onChange={(e) => set('app.name', e.target.value)} disabled={!canEdit} />
      <SelectField label="Default timezone" value={s['app.timezone']} onChange={(e) => set('app.timezone', e.target.value)} disabled={!canEdit} help="Used for new reminders and schedule times">
        {(TIMEZONES.includes(s['app.timezone']) ? TIMEZONES : [s['app.timezone'], ...TIMEZONES]).map((z) => <option key={z}>{z}</option>)}
      </SelectField>
      <TimeField label="Default send time" value={s['reminder.default_send_time']} onChange={(e) => set('reminder.default_send_time', e.target.value)} disabled={!canEdit} />
      <Switch checked={s['whatsapp.groups_supported']} onChange={(v) => set('whatsapp.groups_supported', v)} disabled={!canEdit} label="My WhatsApp business number is eligible for the Groups API" />
      <p className="body-s muted">Leave this off unless Meta has enabled group messaging for your number. Group recipients otherwise use manual sharing.</p>
      {canEdit ? <div><Button loading={busy} onClick={save}>Save settings</Button></div> : <p className="body-s muted">You can view these settings but not change them.</p>}
    </Card>
  );
}

function NotificationsCard() {
  const { notify } = useOverlay();
  const state = useAsync(() => getPushState(), []);
  const [busy, setBusy] = useState(false);
  const label: Record<PushState, string> = {
    unsupported: 'This browser does not support push notifications.',
    'server-disabled': 'Notifications are not set up on the server yet (VAPID keys missing).',
    denied: 'Notifications are blocked for this site. Allow them in your browser or phone settings, then reload.',
    off: 'Off on this device.',
    on: 'On for this device.',
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
      <h2 className="title-m">Notifications</h2>
      <p className="body-m muted">Get a notification when a reminder is ready to be sent, so you can tap it and share it on WhatsApp.</p>
      {needsHomeScreenInstall() && (
        <div className="banner">On iPhone/iPad, first tap Share, then “Add to Home Screen”, and open the app from the Home Screen. Notifications only work from there.</div>
      )}
      {state.loading && !state.data ? <div className="spinner" role="status" aria-label="Loading" /> : state.error ? <div className="banner error">{state.error}</div> : (
        <>
          <p className="title-s">{state.data ? label[state.data.state] : ''}</p>
          <div className="row">
            {state.data?.state === 'off' && <Button loading={busy} icon="campaign" onClick={() => run(enablePush, 'Notifications enabled')}>Enable on this device</Button>}
            {state.data?.state === 'on' && (
              <>
                <Button variant="tonal" loading={busy} onClick={() => run(sendTestPush, 'Test notification sent')}>Send test</Button>
                <Button variant="outlined" loading={busy} onClick={() => run(disablePush, 'Notifications turned off')}>Turn off</Button>
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
      <h1 className="headline-m">Settings</h1>

      <Card variant="outlined">
        <h2 className="title-m">Appearance</h2>
        <p className="body-s muted">Saved on this device.</p>
        <Segmented<ThemeMode> label="Theme" value={mode} onChange={setMode} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} />
        <div>
          <div className="label-l" style={{ marginBottom: 8 }}>Accent color</div>
          <div className="row" role="group" aria-label="Accent color">
            {SEED_PRESETS.map((p) => <button key={p.hex} className="swatch" style={{ background: p.hex }} aria-label={p.name} aria-pressed={seed.toLowerCase() === p.hex} title={p.name} onClick={() => setSeed(p.hex)} />)}
            <label className="row" style={{ gap: 8 }}>
              <input type="color" value={seed} onChange={(e) => setSeed(e.target.value)} aria-label="Custom accent color" style={{ width: 40, height: 40, border: 0, padding: 0, background: 'none' }} />
              <span className="body-s muted">Custom</span>
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
