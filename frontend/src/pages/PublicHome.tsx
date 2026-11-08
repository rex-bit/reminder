import { useEffect, useState, type ReactNode } from 'react';
import { errorMessage } from '../api/client';
import { publicApi } from '../api/endpoints';
import { EMPTY_CONTENT, type PublicReminder, type ReminderContent } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { longDate, todayIso } from '../lib/format';
import { disablePublicPush, enablePublicPush, getPublicPushState, needsHomeScreenInstall, type PushState } from '../lib/push';
import { LanguageSwitch } from '../i18n/LanguageSwitch';
import { useAsync } from '../lib/useAsync';
import { SEED_PRESETS } from '../theme/palette';
import { useTheme, type ThemeMode } from '../theme/ThemeProvider';
import { Button, Card, LinkButton, Segmented } from '../ui/controls';
import { useOverlay } from '../ui/overlay';
import { EmptyState, ErrorState, LoadingList } from '../ui/states';

function Section({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div>
      <div className="label-l muted">
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

function ReminderCard({ r, highlight }: { r: PublicReminder; highlight?: boolean }) {
  // Older or partial rows may lack some keys; never crash the public page on them.
  const c: ReminderContent = { ...EMPTY_CONTENT, ...r.content };
  const hasContent = Boolean(c.uniform.trim() || c.subjects.length || c.homework.length || c.piket.length || c.notes.trim() || c.announcements.trim());
  const emergency = r.kind === 'emergency';
  return (
    <Card variant={highlight ? 'tonal-primary' : 'outlined'}>
      <div className="row">
        <div className="grow" style={{ minWidth: 0 }}>
          <h3 className="title-m">{emergency ? '🚨 ' : ''}{r.title}</h3>
          <div className="body-s muted">{longDate(r.reminder_date)}</div>
        </div>
      </div>
      {!hasContent && r.custom_message ? (
        <p className="body-m" style={{ whiteSpace: 'pre-wrap' }}>{r.custom_message}</p>
      ) : (
        <div className="stack">
          {c.uniform.trim() && (
            <Section icon="👕" title="Seragam">
              <p className="body-m">{c.uniform}</p>
            </Section>
          )}
          {c.subjects.length > 0 && (
            <Section icon="📚" title="Jadwal pelajaran">
              <ol className="body-m" style={{ margin: 0, paddingLeft: 20 }}>
                {c.subjects.map((s, i) => (
                  <li key={i}>{[s.time, s.subject, s.teacher ? `(${s.teacher})` : ''].filter(Boolean).join(' ')}</li>
                ))}
              </ol>
            </Section>
          )}
          {c.homework.length > 0 && (
            <Section icon="📝" title="PR / Tugas">
              <ul className="body-m" style={{ margin: 0, paddingLeft: 20 }}>
                {c.homework.map((h, i) => (
                  <li key={i}>
                    <strong>{h.subject}:</strong> {h.task}
                    {h.due ? ` (kumpul ${h.due})` : ''}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {c.piket.length > 0 && (
            <Section icon="🧹" title="Piket">
              <ul className="body-m" style={{ margin: 0, paddingLeft: 20 }}>
                {c.piket.map((p, i) => (
                  <li key={i}>
                    {p.name}
                    {p.area ? ` - ${p.area}` : ''}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {c.notes.trim() && (
            <Section icon="🗒️" title="Catatan">
              <p className="body-m" style={{ whiteSpace: 'pre-wrap' }}>{c.notes}</p>
            </Section>
          )}
          {c.announcements.trim() && (
            <Section icon="📢" title="Pengumuman">
              <p className="body-m" style={{ whiteSpace: 'pre-wrap' }}>{c.announcements}</p>
            </Section>
          )}
        </div>
      )}
    </Card>
  );
}

/** Look & feel for visitors: saved on their own device only. */
function AppearanceCard() {
  const { mode, setMode, seed, setSeed } = useTheme();
  return (
    <details>
      <summary className="title-m" style={{ cursor: 'pointer', padding: '8px 0' }}>🎨 Tampilan &amp; warna</summary>
      <Card variant="outlined">
        <LanguageSwitch />
        <Segmented<ThemeMode> label="Tema" value={mode} onChange={setMode} options={[{ value: 'light', label: 'Terang' }, { value: 'dark', label: 'Gelap' }, { value: 'system', label: 'Otomatis' }]} />
        <div className="row" role="group" aria-label="Warna aksen">
          {SEED_PRESETS.map((p) => (
            <button key={p.hex} className="swatch" style={{ background: p.hex }} aria-label={p.name} aria-pressed={seed.toLowerCase() === p.hex} title={p.name} onClick={() => setSeed(p.hex)} />
          ))}
          <label className="row" style={{ gap: 8 }}>
            <input type="color" value={seed} onChange={(e) => setSeed(e.target.value)} aria-label="Warna kustom" style={{ width: 40, height: 40, border: 0, padding: 0, background: 'none' }} />
            <span className="body-s muted">Pilih sendiri</span>
          </label>
        </div>
        <p className="body-s muted">Tersimpan di perangkat ini saja.</p>
      </Card>
    </details>
  );
}

function NotificationsCard() {
  const { notify } = useOverlay();
  const state = useAsync(() => getPublicPushState(), []);
  const [busy, setBusy] = useState(false);
  const label: Record<PushState, string> = {
    unsupported: 'Browser ini belum mendukung notifikasi.',
    'server-disabled': 'Notifikasi belum diaktifkan oleh admin.',
    denied: 'Notifikasi diblokir untuk situs ini. Izinkan lewat pengaturan browser/HP, lalu muat ulang.',
    off: 'Aktifkan supaya kamu dapat notifikasi saat ada pengingat atau pengumuman baru.',
    on: 'Notifikasi aktif di perangkat ini.',
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

  if (state.data === null || state.data === 'server-disabled') return null;
  return (
    <Card variant="filled">
      <h2 className="title-m">🔔 Notifikasi</h2>
      {needsHomeScreenInstall() && <div className="banner">Di iPhone/iPad: ketuk Bagikan, pilih “Tambah ke Layar Utama”, lalu buka dari ikon itu. Notifikasi hanya berfungsi dari sana.</div>}
      <p className="body-m">{label[state.data]}</p>
      <div className="row">
        {state.data === 'off' && <Button loading={busy} icon="campaign" onClick={() => run(enablePublicPush, 'Notifikasi diaktifkan')}>Aktifkan notifikasi</Button>}
        {state.data === 'on' && <Button variant="outlined" loading={busy} onClick={() => run(disablePublicPush, 'Notifikasi dimatikan')}>Matikan</Button>}
      </div>
    </Card>
  );
}

export function PublicHomePage() {
  const { admin } = useAuth();
  const feed = useAsync((s) => publicApi.feed(s), []);
  const { reload } = feed;

  // Refresh when the student comes back to the tab/app.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  const d = feed.data;
  const today = d ? todayIso(d.timezone) : '';
  const todays = d?.upcoming.filter((r) => r.reminder_date === today) ?? [];
  const later = d?.upcoming.filter((r) => r.reminder_date !== today) ?? [];
  const pinned = d?.pinned ?? [];
  const recent = (d?.recent ?? []).filter((r) => !pinned.some((p) => p.id === r.id));
  const disabled = feed.error && feed.error.toLowerCase().includes('not enabled');

  return (
    <div className="page" style={{ maxWidth: 720, margin: '0 auto', padding: '16px 16px 48px' }}>
      <div className="page-head">
        <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" width={44} height={44} style={{ borderRadius: 12 }} />
        <div className="grow">
          <h1 className="headline-m">Info Kelas</h1>
          <p className="body-m muted">Jadwal, seragam, PR, dan pengumuman</p>
        </div>
        {admin ? (
          <LinkButton to="/" variant="tonal" icon="dashboard">Dashboard</LinkButton>
        ) : null}
      </div>

      {feed.loading && !d && <LoadingList />}
      {disabled && <EmptyState icon="lock" title="Halaman belum aktif" hint="Admin belum mengaktifkan halaman ini." />}
      {feed.error && !d && !disabled && <ErrorState message={feed.error} onRetry={feed.reload} />}

      {d && (
        <>
          {pinned.map((r) => (
            <ReminderCard key={`pin-${r.id}`} r={r} highlight />
          ))}
          <NotificationsCard />

          <h2 className="title-l">Hari ini</h2>
          {todays.length === 0 ? <EmptyState icon="schedule" title="Belum ada info hari ini" hint="Info akan muncul di sini saat admin merilisnya." /> : todays.filter((r) => !pinned.some((p) => p.id === r.id)).map((r) => <ReminderCard key={r.id} r={r} />)}

          {later.length > 0 && (
            <>
              <h2 className="title-l">Mendatang</h2>
              {later.filter((r) => !pinned.some((p) => p.id === r.id)).map((r) => <ReminderCard key={r.id} r={r} />)}
            </>
          )}

          {recent.length > 0 && (
            <details>
              <summary className="title-m" style={{ cursor: 'pointer', padding: '8px 0' }}>Sebelumnya ({recent.length})</summary>
              <div className="stack">{recent.map((r) => <ReminderCard key={r.id} r={r} />)}</div>
            </details>
          )}
        </>
      )}
      <AppearanceCard />
      {feed.error && d && <div className="banner error">{feed.error}</div>}
      <p className="body-s muted" style={{ textAlign: 'center' }}>Halaman ini hanya untuk dibaca.</p>
    </div>
  );
}

