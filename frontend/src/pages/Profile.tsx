import { useRef, useState, type FormEvent } from 'react';
import { errorMessage, setAccessToken } from '../api/client';
import { adminsApi, authApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthProvider';
import { fmtDateTime } from '../lib/format';
import { Badge, Button, Card, TextField } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/Avatar';
import { imageToAvatar } from '../lib/avatar';
import { useOverlay } from '../ui/overlay';
import { t } from '../i18n';

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

  const fileRef = useRef<HTMLInputElement>(null);
  if (!admin) return null;
  async function pickPhoto(file?: File) {
    if (!file || !admin) return;
    let data: string;
    try { data = await imageToAvatar(file); } catch { notify(t('Could not use this image'), { kind: 'error' }); return; }
    try { await adminsApi.setAvatar(data); await reloadMe(); notify(t('Photo updated')); } catch (err) { notify(errorMessage(err), { kind: 'error' }); }
  }
  const pwErrs = { next: next && next.length < 12 ? t('At least 12 characters') : undefined, confirm: confirm && confirm !== next ? t('Passwords do not match') : undefined };

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setProfileError(null);
    try {
      await adminsApi.updateMe({ display_name: name.trim(), email });
      await reloadMe();
      notify(t('Profile updated'));
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
      notify(t('Password changed. Other devices were signed out.'));
    } catch (err) {
      setPwError(errorMessage(err));
    } finally {
      setChanging(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="avatar-edit">
          <Avatar src={admin.avatar_url} name={admin.display_name} size="lg" />
          <button type="button" className="avatar-cam" aria-label={t('Change photo')} onClick={() => fileRef.current?.click()}>
            <Icon name="edit" size={16} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        <div className="grow">
          <h1 className="headline-m">{admin.display_name}</h1>
          <div className="row" style={{ gap: 8 }}>
            <Badge status="active">{admin.role_key === 'owner' ? t('Owner') : 'Admin'}</Badge>
            <span className="mono muted">{admin.admin_code}</span>
          </div>
        </div>
        <Button variant="outlined" icon="logout" onClick={() => logout()}>{t('Sign out')}</Button>
      </div>

      {admin.must_change_password && <div className="banner" role="alert">{t('You must set a new password before you can use the app.')}</div>}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <Card variant="outlined">
          <form className="stack" onSubmit={saveProfile}>
            <h2 className="title-m">{t('Profile')}</h2>
            {profileError && <div className="banner error" role="alert">{profileError}</div>}
            <TextField label={t('Display name')} value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label={t('Email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <TextField label={t('Username')} value={admin.username} disabled readOnly />
            <div className="row" style={{ gap: 8 }}>
              <Button type="button" variant="tonal" icon="edit" onClick={() => fileRef.current?.click()}>{t('Change photo')}</Button>
              {admin.avatar_url && <Button type="button" variant="text" onClick={async () => { try { await adminsApi.setAvatar(null); await reloadMe(); notify(t('Photo removed')); } catch (err) { notify(errorMessage(err), { kind: 'error' }); } }}>{t('Remove photo')}</Button>}
            </div>
            <p className="body-s muted">{t('Visible to all admins.')}</p>
            <p className="body-s muted">{t('Last sign-in: {time}', { time: fmtDateTime(admin.last_login_at) })}</p>
            <div><Button type="submit" loading={saving} disabled={!name.trim() || !email}>{t('Save profile')}</Button></div>
          </form>
        </Card>

        <Card variant="outlined">
          <form className="stack" onSubmit={changePassword}>
            <h2 className="title-m">{t('Change password')}</h2>
            {pwError && <div className="banner error" role="alert">{pwError}</div>}
            <TextField label={t('Current password')} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            <TextField label={t('New password')} type="password" value={next} onChange={(e) => setNext(e.target.value)} error={pwErrs.next} autoComplete="new-password" />
            <TextField label={t('Confirm new password')} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={pwErrs.confirm} autoComplete="new-password" />
            <div><Button type="submit" loading={changing} disabled={!current || !next || !!pwErrs.next || next !== confirm}>{t('Change password')}</Button></div>
          </form>
        </Card>
      </div>

      <Card variant="filled">
        <h2 className="title-m">{t('Your permissions')}</h2>
        <div className="chips">
          {admin.role_key === 'owner' ? <span className="chip static">{t('All permissions (Owner)')}</span> : admin.permissions.map((p) => <span key={p} className="chip static mono">{p}</span>)}
        </div>
      </Card>
    </div>
  );
}
