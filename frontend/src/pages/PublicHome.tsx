import { useEffect, useState, type ReactNode } from 'react';
import { errorMessage } from '../api/client';
import { publicApi } from '../api/endpoints';
import { EMPTY_CONTENT, type PublicReminder, type ReminderContent } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { buildMessage, longDate, manualShareUrl, todayIso } from '../lib/format';
import { disablePublicPush, enablePublicPush, getPublicPushState, needsHomeScreenInstall, type PushState } from '../lib/push';
import { LanguageSwitch } from '../i18n/LanguageSwitch';
import { useAsync } from '../lib/useAsync';
import { SEED_PRESETS } from '../theme/palette';
import { useTheme, type ThemeMode } from '../theme/ThemeProvider';
import { IconButton, LinkButton, Segmented, Switch } from '../ui/controls';
import { BottomSheet, useOverlay } from '../ui/overlay';
import { EmptyState, ErrorState, LoadingList } from '../ui/states';

type Tab = 'today' | 'later' | 'past';

/** Round tonal container for an emoji/icon, the Material 3 "leading icon" look. */
function TonalIcon({ children }: { children: ReactNode }) {
  return <span className="ticon" aria-hidden="true">{children}</span>;
}

function Section({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div className="psec">
      <TonalIcon>{icon}</TonalIcon>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="label-l muted">{title}</div>
        {children}
      </div>
    </div>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function ReminderCard({ r, emergency }: { r: PublicReminder; emergency?: boolean }) {
  const { notify } = useOverlay();
  // Older or partial rows may lack some keys; never crash the public page on them.
  const c: ReminderContent = { ...EMPTY_CONTENT, ...r.content };
  const hasContent = Boolean(c.uniform.trim() || c.subjects.length || c.homework.length || c.piket.length || c.notes.trim() || c.announcements.trim());
  const isEmergency = emergency || r.kind === 'emergency';
  const text = buildMessage({ title: r.title, kind: r.kind, reminder_date: r.reminder_date, custom_message: r.custom_message, content: c });
  return (
    <article className={`card pcard${isEmergency ? ' emergency' : ''}`}>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        {isEmergency && <TonalIcon>🚨</TonalIcon>}
        <div className="grow" style={{ minWidth: 0 }}>
          <h3 className="title-m">{r.title}</h3>
          <div className="body-s muted">{longDate(r.reminder_date)}</div>
        </div>
        <IconButton
          icon="copy"
          label="Salin pesan"
          onClick={async () => notify((await copyText(text)) ? 'Pesan disalin' : 'Tidak bisa menyalin', { kind: 'info' })}
        />
        <a className="btn btn-text icon-only" href={manualShareUrl(text)} target="_blank" rel="noopener noreferrer" aria-label="Bagikan ke WhatsApp" title="Bagikan ke WhatsApp">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92S19.61 16.08 18 16.08z" /></svg>
        </a>
      </div>
      {!hasContent && r.custom_message ? (
        <p className="body-m" style={{ whiteSpace: 'pre-wrap' }}>{r.custom_message}</p>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          {c.uniform.trim() && (
            <Section icon="👕" title="Seragam">
              <p className="body-m">{c.uniform}</p>
            </Section>
          )}
          {c.subjects.length > 0 && (
            <Section icon="📚" title="Jadwal pelajaran">
              <ol className="plist">
                {c.subjects.map((s, i) => (
                  <li key={i}>
                    {s.time && <span className="ptime">{s.time}</span>}
                    <span className="grow">{s.subject}{s.teacher ? <span className="muted"> · {s.teacher}</span> : null}</span>
                  </li>
                ))}
              </ol>
            </Section>
          )}
          {c.homework.length > 0 && (
            <Section icon="📝" title="PR / Tugas">
              <ul className="plist">
                {c.homework.map((h, i) => (
                  <li key={i}>
                    <span className="grow"><strong>{h.subject}</strong>: {h.task}</span>
                    {h.due && <span className="pchip">Kumpul {h.due}</span>}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {c.piket.length > 0 && (
            <Section icon="🧹" title="Piket">
              <div className="chips" style={{ marginTop: 4 }}>
                {c.piket.map((p, i) => (
                  <span key={i} className="chip static">{p.name}{p.area ? ` · ${p.area}` : ''}</span>
                ))}
              </div>
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
    </article>
  );
}

function Tile({ icon, label, value, hint }: { icon: string; label: string; value: string; hint?: string }) {
  return (
    <div className="tile">
      <TonalIcon>{icon}</TonalIcon>
      <div className="label-m muted">{label}</div>
      <div className="title-m">{value}</div>
      {hint && <div className="body-s muted">{hint}</div>}
    </div>
  );
}

function greeting(tz: string): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: tz }).format(new Date())) % 24;
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
}

function AppearanceSheet({ onClose }: { onClose(): void }) {
  const { mode, setMode, seed, setSeed } = useTheme();
  return (
    <BottomSheet title="Tampilan & warna" onClose={onClose}>
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
    </BottomSheet>
  );
}

function NotificationsCard() {
  const { notify } = useOverlay();
  const state = useAsync(() => getPublicPushState(), []);
  const [busy, setBusy] = useState(false);
  const hint: Record<PushState, string> = {
    unsupported: 'Browser ini belum mendukung notifikasi.',
    'server-disabled': '',
    denied: 'Diblokir untuk situs ini. Izinkan lewat pengaturan browser/HP, lalu muat ulang.',
    off: 'Dapat kabar saat ada info atau pengumuman baru.',
    on: 'Aktif di perangkat ini.',
  };

  async function toggle(on: boolean) {
    setBusy(true);
    try {
      await (on ? enablePublicPush() : disablePublicPush());
      notify(on ? 'Notifikasi diaktifkan' : 'Notifikasi dimatikan');
      state.reload();
    } catch (e) {
      notify(errorMessage(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  if (state.data === null || state.data === 'server-disabled') return null;
  const usable = state.data === 'on' || state.data === 'off';
  return (
    <div className="card filled">
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <TonalIcon>🔔</TonalIcon>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="title-m">Notifikasi</div>
          <div className="body-s muted">{hint[state.data]}</div>
        </div>
        {usable && <Switch checked={state.data === 'on'} disabled={busy} onChange={toggle} label={<span className="sr-only">Notifikasi</span>} />}
      </div>
      {needsHomeScreenInstall() && <div className="banner">Di iPhone/iPad: ketuk Bagikan, pilih “Tambah ke Layar Utama”, lalu buka dari ikon itu. Notifikasi hanya berfungsi dari sana.</div>}
    </div>
  );
}

export function PublicHomePage() {
  const { admin } = useAuth();
  const feed = useAsync((s) => publicApi.feed(s), []);
  const { reload } = feed;
  const [tab, setTab] = useState<Tab>('today');
  const [look, setLook] = useState(false);

  // Refresh when the student comes back to the tab/app.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  const d = feed.data;
  const today = d ? todayIso(d.timezone) : '';
  const pinned = d?.pinned ?? [];
  const notPinned = (r: PublicReminder) => !pinned.some((p) => p.id === r.id);
  const todays = (d?.upcoming ?? []).filter((r) => r.reminder_date === today && notPinned(r));
  const later = (d?.upcoming ?? []).filter((r) => r.reminder_date !== today && notPinned(r));
  const past = (d?.recent ?? []).filter(notPinned);
  const disabled = Boolean(feed.error && feed.error.toLowerCase().includes('not enabled'));

  // Quick facts for the tiles come from today's released reminders.
  const todayContent = todays.map((r) => ({ ...EMPTY_CONTENT, ...r.content }));
  const uniform = todayContent.map((c) => c.uniform.trim()).find(Boolean);
  const homework = todayContent.flatMap((c) => c.homework);
  const piket = todayContent.flatMap((c) => c.piket);

  const lists: Record<Tab, PublicReminder[]> = { today: todays, later, past };
  const empty: Record<Tab, [string, string]> = {
    today: ['Belum ada info hari ini', 'Info akan muncul di sini saat admin merilisnya.'],
    later: ['Belum ada info mendatang', 'Jadwal untuk hari-hari berikutnya muncul di sini.'],
    past: ['Belum ada riwayat', 'Info 14 hari terakhir muncul di sini.'],
  };

  return (
    <div className="pubhome">
      <header className="appbar">
        <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" width={36} height={36} style={{ borderRadius: 10 }} />
        <h1 className="title-l grow">Info Kelas</h1>
        <IconButton icon="refresh" label="Muat ulang" onClick={reload} />
        <IconButton icon="settings" label="Tampilan & warna" onClick={() => setLook(true)} />
        {admin && <LinkButton to="/" variant="tonal" icon="dashboard">Dasbor</LinkButton>}
      </header>

      <main className="pubmain">
        {feed.loading && !d && <LoadingList />}
        {disabled && <EmptyState icon="lock" title="Halaman belum aktif" hint="Admin belum mengaktifkan halaman ini." />}
        {feed.error && !d && !disabled && <ErrorState message={feed.error} onRetry={feed.reload} />}

        {d && (
          <>
            <section className="hero">
              <div className="label-l">{greeting(d.timezone)} 👋</div>
              <div className="display-s">{longDate(today)}</div>
              <div className="chips">
                <span className="chip static">{todays.length} info hari ini</span>
                <span className="chip static">{homework.length} PR</span>
                {later.length > 0 && <span className="chip static">{later.length} mendatang</span>}
              </div>
            </section>

            {pinned.map((r) => (
              <ReminderCard key={`pin-${r.id}`} r={r} emergency />
            ))}

            <div className="tiles">
              <Tile icon="👕" label="Seragam" value={uniform ?? '—'} />
              <Tile icon="📝" label="PR / Tugas" value={homework.length ? `${homework.length} tugas` : '—'} hint={homework[0] ? `${homework[0].subject}: ${homework[0].task}` : undefined} />
              <Tile icon="🧹" label="Piket" value={piket.length ? `${piket.length} orang` : '—'} hint={piket.slice(0, 2).map((p) => p.name).join(', ') || undefined} />
            </div>

            <NotificationsCard />

            <div className="tabs" role="tablist" aria-label="Pilih waktu">
              {([['today', 'Hari ini', todays.length], ['later', 'Mendatang', later.length], ['past', 'Sebelumnya', past.length]] as [Tab, string, number][]).map(([key, label, n]) => (
                <button key={key} role="tab" aria-selected={tab === key} className="tab" onClick={() => setTab(key)}>
                  {label}
                  {n > 0 && <span className="tbadge">{n}</span>}
                </button>
              ))}
            </div>

            <div className="stack" role="tabpanel" key={tab}>
              {lists[tab].length === 0 ? <EmptyState icon="schedule" title={empty[tab][0]} hint={empty[tab][1]} /> : lists[tab].map((r) => <ReminderCard key={r.id} r={r} />)}
            </div>
          </>
        )}

        {feed.error && d && <div className="banner error">{feed.error}</div>}
        <p className="body-s muted" style={{ textAlign: 'center' }}>Halaman ini hanya untuk dibaca. · <a href="/privacy">Privasi</a></p>
      </main>
      {look && <AppearanceSheet onClose={() => setLook(false)} />}
    </div>
  );
}
