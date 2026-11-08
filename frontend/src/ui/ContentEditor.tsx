import type { ReactNode } from 'react';
import type { ReminderContent } from '../api/types';
import { Button, Card, IconButton, TextArea, TextField } from './controls';
import { t } from '../i18n';

function ListEditor<T>({ title, items, onChange, blank, render, addLabel }: { title: string; items: T[]; onChange(v: T[]): void; blank: T; render(item: T, set: (v: T) => void): ReactNode; addLabel: string }) {
  return (
    <Card variant="outlined">
      <h3 className="title-m">{title}</h3>
      {items.length === 0 && <p className="body-s muted">{t('Nothing added yet.')}</p>}
      {items.map((it, i) => (
        <div className="editor-row" key={i}>
          {render(it, (v) => onChange(items.map((x, j) => (j === i ? v : x))))}
          <IconButton icon="delete" label={t('Remove {title} item {n}', { title, n: i + 1 })} onClick={() => onChange(items.filter((_, j) => j !== i))} />
        </div>
      ))}
      <div>
        <Button variant="tonal" icon="add" onClick={() => onChange([...items, blank])}>{addLabel}</Button>
      </div>
    </Card>
  );
}

export function ContentEditor({ content, onChange }: { content: ReminderContent; onChange(c: ReminderContent): void }) {
  const set = <K extends keyof ReminderContent>(k: K, v: ReminderContent[K]) => onChange({ ...content, [k]: v });
  return (
    <>
          <Card variant="outlined">
            <TextField label={t('Uniform')} value={content.uniform} onChange={(e) => set('uniform', e.target.value)} />
          </Card>

          <ListEditor title={t('Subject schedule')} items={content.subjects} onChange={(v) => set('subjects', v)} blank={{ subject: '' }} addLabel={t('Add subject')}
            render={(s, up) => (
              <div className="editor-grid" style={{ gridTemplateColumns: '1fr 2fr 1fr' }}>
                <TextField label={t('Time')} value={s.time ?? ''} onChange={(e) => up({ ...s, time: e.target.value })} />
                <TextField label={t('Subject')} value={s.subject} onChange={(e) => up({ ...s, subject: e.target.value })} />
                <TextField label={t('Teacher')} value={s.teacher ?? ''} onChange={(e) => up({ ...s, teacher: e.target.value })} />
              </div>
            )} />

          <ListEditor title={t('Homework / assignments')} items={content.homework} onChange={(v) => set('homework', v)} blank={{ subject: '', task: '' }} addLabel={t('Add assignment')}
            render={(h, up) => (
              <div className="editor-grid" style={{ gridTemplateColumns: '1fr 2fr 1fr' }}>
                <TextField label={t('Subject')} value={h.subject} onChange={(e) => up({ ...h, subject: e.target.value })} />
                <TextField label={t('Task')} value={h.task} onChange={(e) => up({ ...h, task: e.target.value })} />
                <TextField label={t('Due')} value={h.due ?? ''} onChange={(e) => up({ ...h, due: e.target.value })} />
              </div>
            )} />

          <ListEditor title={t('Duty roster (Piket)')} items={content.piket} onChange={(v) => set('piket', v)} blank={{ name: '' }} addLabel={t('Add person')}
            render={(p, up) => (
              <div className="editor-grid">
                <TextField label={t('Name')} value={p.name} onChange={(e) => up({ ...p, name: e.target.value })} />
                <TextField label={t('Area')} value={p.area ?? ''} onChange={(e) => up({ ...p, area: e.target.value })} />
              </div>
            )} />

          <Card variant="outlined">
            <TextArea label={t('Additional notes')} value={content.notes} onChange={(e) => set('notes', e.target.value)} />
            <TextArea label={t('Important announcements')} value={content.announcements} onChange={(e) => set('announcements', e.target.value)} />
          </Card>
    </>
  );
}
