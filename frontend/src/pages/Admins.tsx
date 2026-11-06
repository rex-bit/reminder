import { useState } from 'react';
import { errorMessage } from '../api/client';
import { adminsApi } from '../api/endpoints';
import type { Admin, PermissionDef } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { fmtDateTime } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Badge, Button, Checkbox, IconButton, Switch, TextField } from '../ui/controls';
import { Dialog, useOverlay } from '../ui/overlay';
import { AsyncView, EmptyState, ErrorState } from '../ui/states';

function PermissionPicker({ catalog, value, onChange, mine, disabled }: { catalog: PermissionDef[]; value: string[]; onChange(v: string[]): void; mine: (k: string) => boolean; disabled?: boolean }) {
  const groups = [...new Set(catalog.map((p) => p.category))];
  return (
    <div className="stack" style={{ gap: 12 }}>
      {groups.map((g) => (
        <fieldset key={g} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label-l" style={{ padding: 0, marginBottom: 4 }}>{g}</legend>
          <div className="perm-group">
            {catalog.filter((p) => p.category === g).map((p) => (
              <Checkbox key={p.key} disabled={disabled || !mine(p.key)} checked={value.includes(p.key)} onChange={(v) => onChange(v ? [...value, p.key] : value.filter((k) => k !== p.key))}
                label={<>{p.description} <span className="mono muted">{p.key}</span></>} />
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function AdminDialog({ target, catalog, defaults, onClose, onSaved }: { target: Admin | null; catalog: PermissionDef[]; defaults: string[]; onClose(): void; onSaved(): void }) {
  const { can } = useAuth();
  const { notify } = useOverlay();
  const [username, setUsername] = useState(target?.username ?? '');
  const [email, setEmail] = useState(target?.email ?? '');
  const [name, setName] = useState(target?.display_name ?? '');
  const [password, setPassword] = useState('');
  const [active, setActive] = useState(target ? target.status === 'active' : true);
  const [perms, setPerms] = useState<string[]>(target ? target.permissions : defaults);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const isOwner = target?.role_key === 'owner';

  const errs: Record<string, string> = {};
  if (!target) {
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) errs.username = '3-32 letters, numbers, . _ -';
    if (password.length < 12) errs.password = 'At least 12 characters';
  }
  if (!name.trim()) errs.name = 'Name is required';
  if (!/^\S+@\S+\.\S+$/.test(email)) errs.email = 'Enter a valid email';

  async function save() {
    setTouched(true);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      if (target) await adminsApi.update(target.id, { display_name: name.trim(), email, ...(isOwner ? {} : { status: active ? 'active' : 'disabled', ...(can('admins.permissions') ? { permissions: perms } : {}) }) });
      else await adminsApi.create({ username, email, display_name: name.trim(), password, permissions: can('admins.permissions') ? perms : defaults });
      notify(target ? 'Admin updated' : 'Admin added. They must change the password on first sign-in.');
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={target ? `Edit ${target.admin_code}` : 'Add admin'} onClose={onClose} actions={<><Button variant="text" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}>
      {error && <div className="banner error" role="alert">{error}</div>}
      <TextField label="Display name" value={name} onChange={(e) => setName(e.target.value)} error={touched ? errs.name : undefined} />
      {!target && <TextField label="Username" value={username} onChange={(e) => setUsername(e.target.value)} error={touched ? errs.username : undefined} autoComplete="off" />}
      <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={touched ? errs.email : undefined} />
      {!target && <TextField label="Temporary password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={touched ? errs.password : undefined} help="Share it securely; the admin must change it at first sign-in." autoComplete="new-password" />}
      {target && !isOwner && <Switch checked={active} onChange={setActive} label={active ? 'Account active' : 'Account disabled'} />}
      {isOwner ? <div className="banner info">The Owner always has every permission.</div> : (
        <>
          <h3 className="title-m">Permissions</h3>
          {!can('admins.permissions') && <p className="body-s muted">You can’t change permissions. Defaults apply to new admins.</p>}
          <p className="body-s muted">You can only grant permissions you have yourself.</p>
          <PermissionPicker catalog={catalog} value={perms} onChange={setPerms} mine={(k) => can(k)} disabled={!can('admins.permissions')} />
        </>
      )}
    </Dialog>
  );
}

function ResetDialog({ target, onClose }: { target: Admin; onClose(): void }) {
  const { notify } = useOverlay();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    try {
      await adminsApi.resetPassword(target.id, pw);
      notify('Password reset. All their sessions were signed out.');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={`Reset password for ${target.admin_code}`} onClose={onClose} actions={<><Button variant="text" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={pw.length < 12} onClick={go}>Reset</Button></>}>
      {error && <div className="banner error" role="alert">{error}</div>}
      <TextField label="New temporary password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} help="At least 12 characters. They must change it on next sign-in." autoComplete="new-password" />
    </Dialog>
  );
}

export function AdminsPage() {
  const { admin: me, can } = useAuth();
  const { notify, confirm } = useOverlay();
  const state = useAsync((s) => adminsApi.list(s), []);
  const catalog = useAsync((s) => adminsApi.catalog(s), []);
  const [dlg, setDlg] = useState<Admin | 'new' | null>(null);
  const [reset, setReset] = useState<Admin | null>(null);

  async function remove(a: Admin) {
    if (!(await confirm({ title: 'Remove admin?', body: `${a.display_name} (${a.admin_code}) will lose access immediately. Their past activity stays in the logs.`, confirmLabel: 'Remove', danger: true }))) return;
    try {
      await adminsApi.remove(a.id);
      notify('Admin removed');
      state.reload();
    } catch (e) {
      notify(errorMessage(e), { kind: 'error' });
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="headline-m">Admin management</h1>
        {can('admins.create') && <Button icon="add" disabled={!catalog.data} onClick={() => setDlg('new')}>Add admin</Button>}
      </div>
      {catalog.error && <ErrorState message={catalog.error} onRetry={catalog.reload} />}
      <AsyncView state={state} isEmpty={(d) => d.length === 0} empty={<EmptyState icon="people" title="No admins" />}>
        {(items) => (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Admin</th><th>ID</th><th>Role</th><th>Status</th><th>Last sign-in</th><th aria-label="Actions" /></tr></thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td><div className="row" style={{ flexWrap: 'nowrap' }}><span className="avatar">{a.display_name.charAt(0).toUpperCase()}</span><div><div className="title-s">{a.display_name}{a.id === me?.id && ' (you)'}</div><div className="body-s muted">{a.email}</div></div></div></td>
                    <td className="mono">{a.admin_code}</td>
                    <td><Badge status={a.role_key === 'owner' ? 'active' : undefined}>{a.role_key === 'owner' ? 'Owner' : 'Admin'}</Badge></td>
                    <td><Badge status={a.status} /></td>
                    <td>{fmtDateTime(a.last_login_at)}</td>
                    <td>
                      <div className="row" style={{ gap: 0, flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                        {can('admins.update') && <IconButton icon="edit" label="Edit" onClick={() => setDlg(a)} />}
                        {can('admins.update') && a.role_key !== 'owner' && <IconButton icon="lock" label="Reset password" onClick={() => setReset(a)} />}
                        {can('admins.delete') && a.role_key !== 'owner' && a.id !== me?.id && <IconButton icon="delete" label="Remove" onClick={() => remove(a)} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AsyncView>
      {dlg && catalog.data && <AdminDialog target={dlg === 'new' ? null : dlg} catalog={catalog.data.items} defaults={catalog.data.defaults} onClose={() => setDlg(null)} onSaved={() => { setDlg(null); state.reload(); }} />}
      {reset && <ResetDialog target={reset} onClose={() => setReset(null)} />}
    </div>
  );
}
