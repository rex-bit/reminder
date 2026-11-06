import { useState, type FormEvent } from 'react';
import { errorMessage, setAccessToken } from '../api/client';
import { adminsApi, authApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthProvider';
import { fmtDateTime } from '../lib/format';
import { Badge, Button, Card, TextField } from '../ui/controls';
import { useOverlay } from '../ui/overlay';

export function ProfilePage() {
  const { admin, reloadMe, logout } = useAuth();
  const { notify } = useOverlay();
  const [name, setName] = useState(admin?.display_name ?? '');
  const [email, setEmail] = useState(admin?.email ?? '');
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [changing, setChanging] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  if (!admin) return null;
  const pwErrs = { next: next && next.length < 12 ? 'At least 12 characters' : undefined, confirm: confirm && confirm !== next ? 'Passwords do not match' : undefined };

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setProfileError(null);
    try {
      await adminsApi.updateMe({ display_name: name.trim(), email });
      await reloadMe();
      notify('Profile updated');
    } catch (err) {
      setProfileError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (pwErrs.next || pwErrs.confirm) return;
    setChanging(true);
    setPwError(null);
    try {
      const res = await authApi.changePassword(current, next);
      setAccessToken(res.accessToken);
      setCurrent(''); setNext(''); setConfirm('');
      await reloadMe();
      notify('Password changed. Other devices were signed out.');
    } catch (err) {
      setPwError(errorMessage(err));
    } finally {
      setChanging(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <span className="avatar lg">{admin.display_name.charAt(0).toUpperCase()}</span>
        <div className="grow">
          <h1 className="headline-m">{admin.display_name}</h1>
          <div className="row" style={{ gap: 8 }}>
            <Badge status="active">{admin.role_key === 'owner' ? 'Owner' : 'Admin'}</Badge>
            <span className="mono muted">{admin.admin_code}</span>
          </div>
        </div>
        <Button variant="outlined" icon="logout" onClick={() => logout()}>Sign out</Button>
      </div>

      {admin.must_change_password && <div className="banner" role="alert">You must set a new password before you can use the app.</div>}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <Card variant="outlined">
          <form className="stack" onSubmit={saveProfile}>
            <h2 className="title-m">Profile</h2>
            {profileError && <div className="banner error" role="alert">{profileError}</div>}
            <TextField label="Display name" value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <TextField label="Username" value={admin.username} disabled readOnly />
            <p className="body-s muted">Last sign-in: {fmtDateTime(admin.last_login_at)}</p>
            <div><Button type="submit" loading={saving} disabled={!name.trim() || !email}>Save profile</Button></div>
          </form>
        </Card>

        <Card variant="outlined">
          <form className="stack" onSubmit={changePassword}>
            <h2 className="title-m">Change password</h2>
            {pwError && <div className="banner error" role="alert">{pwError}</div>}
            <TextField label="Current password" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            <TextField label="New password" type="password" value={next} onChange={(e) => setNext(e.target.value)} error={pwErrs.next} autoComplete="new-password" />
            <TextField label="Confirm new password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={pwErrs.confirm} autoComplete="new-password" />
            <div><Button type="submit" loading={changing} disabled={!current || !next || !!pwErrs.next || next !== confirm}>Change password</Button></div>
          </form>
        </Card>
      </div>

      <Card variant="filled">
        <h2 className="title-m">Your permissions</h2>
        <div className="chips">
          {admin.role_key === 'owner' ? <span className="chip static">All permissions (Owner)</span> : admin.permissions.map((p) => <span key={p} className="chip static mono">{p}</span>)}
        </div>
      </Card>
    </div>
  );
}
