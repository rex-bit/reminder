import { useState } from 'react';
import { errorMessage } from '../api/client';
import { templatesApi } from '../api/endpoints';
import { EMPTY_CONTENT, type ReminderContent, type Template } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { useAsync } from '../lib/useAsync';
import { ContentEditor } from '../ui/ContentEditor';
import { Button, Card, IconButton, TextArea, TextField } from '../ui/controls';
import { Dialog, useOverlay } from '../ui/overlay';
import { AsyncView, EmptyState } from '../ui/states';

function TemplateDialog({ initial, onClose, onSaved }: { initial: Template | null; onClose(): void; onSaved(): void }) {
  const { notify } = useOverlay();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [content, setContent] = useState<ReminderContent>({ ...EMPTY_CONTENT, ...initial?.content });
  const [body, setBody] = useState(initial?.message_body ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameError = !name.trim() ? 'Name is required' : undefined;

  async function save() {
    if (nameError) return setError(nameError);
    setBusy(true);
    setError(null);
    try {
      await templatesApi.save({ id: initial?.id, name: name.trim(), description, content, message_body: body.trim() ? body : null });
      notify(initial ? 'Template updated' : 'Template created');
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={initial ? 'Edit template' : 'New template'} onClose={onClose} actions={<><Button variant="text" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}>
      {error && <div className="banner error" role="alert">{error}</div>}
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={error && nameError} maxLength={120} />
      <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
      <ContentEditor content={content} onChange={setContent} />
      <TextArea label="Custom message layout (optional)" value={body} onChange={(e) => setBody(e.target.value)} help="If set, reminders from this template start with this exact text instead of the generated one." />
    </Dialog>
  );
}

export function TemplatesPage() {
  const { can } = useAuth();
  const { notify, confirm } = useOverlay();
  const state = useAsync((s) => templatesApi.list(s), []);
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const manage = can('templates.manage');

  async function remove(t: Template) {
    if (!(await confirm({ title: 'Delete template?', body: `“${t.name}” will be deleted. Reminders already created from it are not affected.`, confirmLabel: 'Delete', danger: true }))) return;
    try {
      await templatesApi.remove(t.id);
      notify('Template deleted');
      state.reload();
    } catch (e) {
      notify(errorMessage(e), { kind: 'error' });
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="headline-m">Reminder templates</h1>
        {manage && <Button icon="add" onClick={() => setEditing('new')}>New template</Button>}
      </div>
      <AsyncView state={state} isEmpty={(d) => d.length === 0} empty={<EmptyState icon="template" title="No templates yet" hint="Templates pre-fill reminders with a standard schedule or layout." action={manage ? <Button onClick={() => setEditing('new')}>Create template</Button> : undefined} />}>
        {(items) => (
          <div className="grid cols-auto">
            {items.map((t) => (
              <Card key={t.id} variant="outlined">
                <h2 className="title-m">{t.name}</h2>
                <p className="body-m muted">{t.description || 'No description'}</p>
                <p className="body-s muted">{t.content.subjects.length} subjects · {t.content.homework.length} assignments · {t.content.piket.length} duty</p>
                {manage && (
                  <div className="row" style={{ gap: 0 }}>
                    <IconButton icon="edit" label="Edit" onClick={() => setEditing(t)} />
                    <IconButton icon="delete" label="Delete" onClick={() => remove(t)} />
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </AsyncView>
      {editing && <TemplateDialog initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); state.reload(); }} />}
    </div>
  );
}
