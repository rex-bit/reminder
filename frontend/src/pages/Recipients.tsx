import { useState } from 'react';
import { t } from '../i18n';
import { errorMessage } from '../api/client';
import { recipientsApi } from '../api/endpoints';
import type { DeliveryChannel, Recipient } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { useAsync } from '../lib/useAsync';
import { Badge, Button, IconButton, SelectField, Switch, TextArea, TextField } from '../ui/controls';
import { Dialog, useOverlay } from '../ui/overlay';
import { AsyncView, EmptyState } from '../ui/states';

const E164 = /^\+[1-9][0-9]{6,14}$/;

function RecipientDialog({ initial, onClose, onSaved }: { initial: Recipient | null; onClose(): void; onSaved(): void }) {
  const { notify } = useOverlay();
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<Recipient['type']>(initial?.type ?? 'individual');
  const [channel, setChannel] = useState<DeliveryChannel>(initial?.channel ?? 'whatsapp_cloud');
  const [phone, setPhone] = useState(initial?.phone_e164 ?? '');
  const [groupId, setGroupId] = useState(initial?.wa_group_id ?? '');
  const [active, setActive] = useState(initial?.is_active ?? true);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const errs: Record<string, string> = {};
  if (!name.trim()) errs.name = t('Name is required');
  if (channel === 'whatsapp_cloud' && type === 'individual' && !E164.test(phone)) errs.phone = t('Use international format, e.g. +60123456789');
  if (channel === 'whatsapp_cloud' && type === 'group' && !groupId.trim()) errs.group = t('Group ID is required');

  async function save() {
    setTouched(true);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      await recipientsApi.save({
        id: initial?.id, name: name.trim(), type, channel, is_active: active, notes,
        phone_e164: channel === 'whatsapp_cloud' && type === 'individual' ? phone : null,
        wa_group_id: channel === 'whatsapp_cloud' && type === 'group' ? groupId.trim() : null,
      });
      notify(initial ? t('Recipient updated') : t('Recipient added'));
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={initial ? t('Edit recipient') : t('New recipient')} onClose={onClose} actions={<><Button variant="text" onClick={onClose}>{t('Cancel')}</Button><Button loading={busy} onClick={save}>{t('Save')}</Button></>}>
      {error && <div className="banner error" role="alert">{error}</div>}
      <TextField label={t('Name')} value={name} onChange={(e) => setName(e.target.value)} error={touched ? errs.name : undefined} />
      <div className="editor-grid">
        <SelectField label={t('Type')} value={type} onChange={(e) => setType(e.target.value as Recipient['type'])}>
          <option value="individual">{t('Individual')}</option>
          <option value="group">{t('Group')}</option>
        </SelectField>
        <SelectField label={t('Delivery')} value={channel} onChange={(e) => setChannel(e.target.value as DeliveryChannel)}>
          <option value="whatsapp_cloud">WhatsApp Cloud API</option>
          <option value="manual_share">{t('Manual share (admin sends)')}</option>
        </SelectField>
      </div>
      {channel === 'whatsapp_cloud' && type === 'individual' && <TextField label={t('Phone (E.164)')} value={phone} onChange={(e) => setPhone(e.target.value)} error={touched ? errs.phone : undefined} inputMode="tel" />}
      {channel === 'whatsapp_cloud' && type === 'group' && (
        <>
          <TextField label={t('WhatsApp group ID')} value={groupId} onChange={(e) => setGroupId(e.target.value)} error={touched ? errs.group : undefined} />
          <div className="banner">{t('The Cloud API cannot message arbitrary existing groups. Only use this for a group created through the Groups API on your business number; otherwise choose “Manual share”.')}</div>
        </>
      )}
      {channel === 'manual_share' && <div className="banner info">{t('The system does not message this recipient. At the scheduled time admins get a notification and the reminder appears under “To send”, where you open WhatsApp and send it yourself.')}</div>}
      <TextArea label={t('Notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Switch checked={active} onChange={setActive} label={t('Active')} />
    </Dialog>
  );
}

export function RecipientsPage() {
  const { can } = useAuth();
  const { notify, confirm } = useOverlay();
  const state = useAsync((s) => recipientsApi.list(s), []);
  const [editing, setEditing] = useState<Recipient | 'new' | null>(null);
  const manage = can('recipients.manage');

  async function remove(r: Recipient) {
    if (!(await confirm({ title: t('Delete recipient?'), body: t('“{name}” will no longer receive reminders. Past delivery logs are kept.', { name: r.name }), confirmLabel: t('Delete'), danger: true }))) return;
    try {
      await recipientsApi.remove(r.id);
      notify(t('Recipient deleted'));
      state.reload();
    } catch (e) {
      notify(errorMessage(e), { kind: 'error' });
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="headline-m">{t('Recipients')}</h1>
        {manage && <Button icon="add" onClick={() => setEditing('new')}>{t('New recipient')}</Button>}
      </div>
      <AsyncView state={state} isEmpty={(d) => d.length === 0} empty={<EmptyState icon="send" title={t('No recipients')} hint={t('Add the numbers or groups that should receive reminders.')} action={manage ? <Button onClick={() => setEditing('new')}>{t('Add recipient')}</Button> : undefined} />}>
        {(items) => (
          <div className="table-wrap">
            <table className="rt">
              <thead><tr><th>{t('Name')}</th><th>{t('Target')}</th><th>{t('Delivery')}</th><th>{t('Status')}</th><th aria-label={t('Actions')} /></tr></thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td className="title-s">{r.name}</td>
                    <td data-label={t('Target')}>{r.type === 'group' ? `${t('Group')}${r.wa_group_id ? ` · ${r.wa_group_id}` : ''}` : r.phone_e164 ?? '—'}</td>
                    <td data-label={t('Delivery')}>{r.channel === 'manual_share' ? <span className="badge manual">{t('Manual share')}</span> : <Badge>WhatsApp API</Badge>}</td>
                    <td data-label={t('Status')}><Badge status={r.is_active ? 'active' : 'disabled'}>{r.is_active ? t('Active') : t('Inactive')}</Badge></td>
                    <td>{manage && <div className="row" style={{ gap: 0, flexWrap: 'nowrap', justifyContent: 'flex-end' }}><IconButton icon="edit" label={t('Edit')} onClick={() => setEditing(r)} /><IconButton icon="delete" label={t('Delete')} onClick={() => remove(r)} /></div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AsyncView>
      {editing && <RecipientDialog initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); state.reload(); }} />}
    </div>
  );
}
