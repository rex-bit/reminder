import { useState } from 'react';
import { ROADMAP, STATUS_HINT, STATUS_LABEL, type RoadmapStatus } from '../data/roadmap';
import { FilterChip } from '../ui/controls';
import { InfoPage } from '../ui/InfoPage';

const ORDER: RoadmapStatus[] = ['planned', 'in_progress', 'completed'];

export function RoadmapPage() {
  const [only, setOnly] = useState<RoadmapStatus | null>(null);
  return (
    <InfoPage wide title="Roadmap" description="Rencana pengembangan Class Reminder: yang direncanakan, sedang dikerjakan, dan sudah selesai." icon="dashboard">
      <div className="chips" role="group" aria-label="Filter status">
        {ORDER.map((s) => (
          <FilterChip key={s} selected={only === s} onClick={() => setOnly(only === s ? null : s)}>
            {STATUS_LABEL[s]} ({ROADMAP.filter((i) => i.status === s).length})
          </FilterChip>
        ))}
      </div>
      {ORDER.filter((s) => !only || only === s).map((s) => {
        const items = ROADMAP.filter((i) => i.status === s);
        return (
          <section key={s} className="info-sec" aria-labelledby={`rm-${s}`}>
            <h2 className="title-l" id={`rm-${s}`}><span className={`rm-badge st-${s}`}>{STATUS_LABEL[s]}</span><span className="body-s muted">{STATUS_HINT[s]}</span></h2>
            {items.length === 0 ? (
              <p className="body-m muted info-empty">Belum ada item.</p>
            ) : (
              <div className="info-grid">
                {items.map((i) => {
                  const done = i.steps?.filter((x) => x.done).length ?? 0;
                  const total = i.steps?.length ?? 0;
                  return (
                    <article key={i.id} className={`card outlined rm-card st-${i.status}`}>
                      <div className="body-s muted">{i.area}</div>
                      <h3 className="title-m">{i.title}</h3>
                      <p className="body-s">{i.description}</p>
                      {i.steps && total > 0 && (
                        <div className="rm-progress">
                          <div className="rm-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={`${done} dari ${total} langkah selesai`}><span style={{ width: `${(done / total) * 100}%` }} /></div>
                          <div className="body-s muted">{done} dari {total} langkah selesai</div>
                          <ul className="rm-steps">
                            {i.steps.map((x) => <li key={x.label} className={x.done ? 'done' : ''}>{x.label}</li>)}
                          </ul>
                        </div>
                      )}
                      {i.note && <p className="body-s muted">{i.note}</p>}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </InfoPage>
  );
}
