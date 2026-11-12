import { CATEGORY_HINT, CATEGORY_LABEL, CHANGELOG, type ChangeCategory } from '../data/changelog';
import { InfoPage } from '../ui/InfoPage';

const CATS = Object.keys(CATEGORY_LABEL) as ChangeCategory[];
const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

export function ChangelogPage() {
  return (
    <InfoPage title="Changelog" description="Riwayat pembaruan Class Reminder: fitur baru, peningkatan, perbaikan, dan yang dihapus, dari versi ke versi." icon="history">
      <ul className="cl-legend" aria-label="Kategori perubahan">
        {CATS.map((c) => (
          <li key={c}><span className={`cl-badge cat-${c}`}>{CATEGORY_LABEL[c]}</span><span className="body-s muted">{CATEGORY_HINT[c]}</span></li>
        ))}
      </ul>
      {CHANGELOG.length === 0 ? (
        <p className="body-m muted info-empty">Changelog belum tersedia. Riwayat pembaruan akan muncul di sini.</p>
      ) : (
        <ol className="timeline">
          {CHANGELOG.map((r) => (
            <li key={r.version} className="tl-item">
              <span className="tl-dot" aria-hidden="true" />
              <article>
                <header className="tl-head">
                  <span className="tl-version">{r.version}</span>
                  <time dateTime={r.date} className="body-s muted">{fmt(r.date)}</time>
                </header>
                <h2 className="title-l">{r.title}</h2>
                <p className="body-m muted">{r.description}</p>
                <ul className="tl-changes">
                  {r.changes.map((c) => (
                    <li key={c.title}>
                      <span className={`cl-badge cat-${c.category}`}>{CATEGORY_LABEL[c.category]}</span>
                      <div>
                        <div className="title-s">{c.title}</div>
                        <div className="body-s muted">{c.description}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </article>
            </li>
          ))}
        </ol>
      )}
    </InfoPage>
  );
}
