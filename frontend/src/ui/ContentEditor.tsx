import type { ReactNode } from 'react';
import type { ReminderContent } from '../api/types';
import { Button, Card, IconButton, TextArea, TextField } from './controls';

function ListEditor<T>({ title, items, onChange, blank, render, addLabel }: { title: string; items: T[]; onChange(v: T[]): void; blank: T; render(item: T, set: (v: T) => void): ReactNode; addLabel: string }) {
  return (
    <Card variant="outlined">
      <h3 className="title-m">{title}</h3>
      {items.length === 0 && <p className="body-s muted">Nothing added yet.</p>}
      {items.map((it, i) => (
        <div className="editor-row" key={i}>
          {render(it, (v) => onChange(items.map((x, j) => (j === i ? v : x))))}
          <IconButton icon="delete" label={`Remove ${title} item ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))} />
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
            <TextField label="Uniform" value={content.uniform} onChange={(e) => set('uniform', e.target.value)} />
          </Card>

          <ListEditor title="Subject schedule" items={content.subjects} onChange={(v) => set('subjects', v)} blank={{ subject: '' }} addLabel="Add subject"
            render={(s, up) => (
              <div className="editor-grid" style={{ gridTemplateColumns: '1fr 2fr 1fr' }}>
                <TextField label="Time" value={s.time ?? ''} onChange={(e) => up({ ...s, time: e.target.value })} />
                <TextField label="Subject" value={s.subject} onChange={(e) => up({ ...s, subject: e.target.value })} />
                <TextField label="Teacher" value={s.teacher ?? ''} onChange={(e) => up({ ...s, teacher: e.target.value })} />
              </div>
            )} />

          <ListEditor title="Homework / assignments" items={content.homework} onChange={(v) => set('homework', v)} blank={{ subject: '', task: '' }} addLabel="Add assignment"
            render={(h, up) => (
              <div className="editor-grid" style={{ gridTemplateColumns: '1fr 2fr 1fr' }}>
                <TextField label="Subject" value={h.subject} onChange={(e) => up({ ...h, subject: e.target.value })} />
                <TextField label="Task" value={h.task} onChange={(e) => up({ ...h, task: e.target.value })} />
                <TextField label="Due" value={h.due ?? ''} onChange={(e) => up({ ...h, due: e.target.value })} />
              </div>
            )} />

          <ListEditor title="Duty roster (Piket)" items={content.piket} onChange={(v) => set('piket', v)} blank={{ name: '' }} addLabel="Add person"
            render={(p, up) => (
              <div className="editor-grid">
                <TextField label="Name" value={p.name} onChange={(e) => up({ ...p, name: e.target.value })} />
                <TextField label="Area" value={p.area ?? ''} onChange={(e) => up({ ...p, area: e.target.value })} />
              </div>
            )} />

          <Card variant="outlined">
            <TextArea label="Additional notes" value={content.notes} onChange={(e) => set('notes', e.target.value)} />
            <TextArea label="Important announcements" value={content.announcements} onChange={(e) => set('announcements', e.target.value)} />
          </Card>
    </>
  );
}
