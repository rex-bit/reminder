import { useState } from 'react';
import { t } from '../i18n';
import { errorMessage } from '../api/client';
import { templatesApi } from '../api/endpoints';
import { EMPTY_CONTENT, type ReminderContent, type Template } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { useAsync } from '../lib/useAsync';
import { ContentEditor } from '../ui/ContentEditor';
import { Icon } from '../ui/Icon';
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
  const nameError = !name.trim() ? t('Name is required') : undefined;

  async function save() {
    if (nameError) return setError(nameError);
    setBusy(true);
    setError(null);
    try {
      await templatesApi.save({ id: initial?.id, name: name.trim(), description, content, message_body: body.trim() ? body : null });
      notify(initial ? t('Template updated') : t('Template created'));
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={initial ? t('Edit template') : t('New template')} onClose={onClose} actions={<><Button variant="text" onClick={onClose}>{t('Cancel')}</Button><Button loading={busy} onClick={save}>{t('Save')}</Button></>}>
      {error && <div className="banner error" role="alert">{error}</div>}
      <TextField label={t('Name')} value={name} onChange={(e) => setName(e.target.value)} error={error && nameError} maxLength={120} />
      <TextField label={t('Description')} value={description} onChange={(e) => setDescription(e.target.value)} />
      <ContentEditor content={content} onChange={setContent} />
      <TextArea label={t('Custom message layout (optional)')} value={body} onChange={(e) => setBody(e.target.value)} help={t('If set, reminders from this template start with this exact text instead of the generated one.')} />
    </Dialog>
  );
}

export function TemplatesPage() {
  const { can } = useAuth();
  const { notify, confirm } = useOverlay();
  const state = useAsync((s) => templatesApi.list(s), []);
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const [q, setQ] = useState('');
  const manage = can('templates.manage');

  async function remove(tpl: Template) {
    if (!(await confirm({ title: t('Delete template?'), body: t('“{name}” will be deleted. Reminders already created from it are not affected.', { name: tpl.name }), confirmLabel: t('Delete'), danger: true }))) return;
    try {
      await templatesApi.remove(tpl.id);
      notify(t('Template deleted'));
      state.reload();
    } catch (e) {
      notify(errorMessage(e), { kind: 'error' });
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="headline-m">{t('Reminder templates')}</h1>
        {manage && <Button icon="add" onClick={() => setEditing('new')}>{t('New template')}</Button>}
      </div>
      <AsyncView state={state} isEmpty={(d) => d.length === 0} empty={<EmptyState icon="template" title={t('No templates yet')} hint={t('Templates pre-fill reminders with a standard schedule or layout.')} action={manage ? <Button onClick={() => setEditing('new')}>{t('Create template')}</Button> : undefined} />}>
        {(all) => {
          const items = all.filter((x) => `${x.name} ${x.description ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));
          return (
          <>
          {all.length > 3 && <TextField label={t('Search')} value={q} onChange={(e) => setQ(e.target.value)} />}
          {items.length === 0 ? <p className="body-m muted">{t('No matching items')}</p> : (
          <div className="grid cols-auto">
            {items.map((tpl) => (
              <Card key={tpl.id} variant="outlined" className="tpl-card">
                <div className="tpl-head">
                  <span className="tpl-ico"><Icon name="template" /></span>
                  <h2 className="title-m grow">{tpl.name}</h2>
                </div>
                <p className="body-m muted">{tpl.description || t('No description')}</p>
                <div className="tpl-stats">
                  <span className="tpl-stat">{tpl.content.subjects.length} {t('subjects')}</span>
                  <span className="tpl-stat">{tpl.content.homework.length} {t('assignments')}</span>
                  <span className="tpl-stat">{tpl.content.piket.length} {t('duty')}</span>
                </div>
                {manage && (
                  <div className="row" style={{ gap: 0 }}>
                    <IconButton icon="edit" label={t('Edit')} onClick={() => setEditing(tpl)} />
                    <IconButton icon="delete" label={t('Delete')} onClick={() => remove(tpl)} />
                  </div>
                )}
              </Card>
            ))}
          </div>)}
          </>
          );
        }}
      </AsyncView>
      {editing && <TemplateDialog initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); state.reload(); }} />}
    </div>
  );
}
