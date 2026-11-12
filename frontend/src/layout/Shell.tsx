import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Fab } from '../ui/controls';
import { GlassNav } from './GlassNav';
import { Avatar } from '../ui/Avatar';
import { BrandMark } from '../ui/Brand';
import { Icon, type IconName } from '../ui/Icon';
import { MenuButton, MenuDivider, MenuItem } from '../ui/Menu';
import { useTheme, type ThemeMode } from '../theme/ThemeProvider';
import { BottomSheet } from '../ui/overlay';
import { t } from '../i18n';

interface Item {
  to: string;
  label: string;
  icon: IconName;
  perm?: string;
  primary?: boolean; // shown in the mobile bottom bar
}

const ITEMS: Item[] = [
  { to: '/', label: t('Dashboard'), icon: 'dashboard', perm: 'reminders.read', primary: true },
  { to: '/due', label: t('To send'), icon: 'send', perm: 'reminders.read', primary: true },
  { to: '/scheduled', label: t('Scheduled'), icon: 'schedule', perm: 'reminders.read', primary: true },
  { to: '/history', label: t('History'), icon: 'history', perm: 'reminders.read', primary: true },
  { to: '/templates', label: t('Templates'), icon: 'template', perm: 'templates.read' },
  { to: '/recipients', label: t('Recipients'), icon: 'people', perm: 'recipients.read' },
  { to: '/delivery-logs', label: t('Delivery logs'), icon: 'mail', perm: 'logs.delivery' },
  { to: '/activity', label: t('Activity logs'), icon: 'receipt', perm: 'logs.activity' },
  { to: '/admins', label: t('Admins'), icon: 'people', perm: 'admins.read' },
  { to: '/settings', label: t('Settings'), icon: 'settings' },
  { to: '/profile', label: t('Profile'), icon: 'person' },
];

function NavItem({ item, onClick }: { item: Item; onClick?(): void }) {
  // NavLink sets aria-current="page" on the active link; styles key off that attribute.
  return (
    <NavLink to={item.to} end={item.to === '/'} className="nav-item" onClick={onClick}>
      <span className="nav-pill">
        <Icon name={item.icon} />
      </span>
      <span className="label-m">{item.label}</span>
    </NavLink>
  );
}

const MODES: { mode: ThemeMode; label: string; icon: IconName }[] = [
  { mode: 'light', label: t('Light'), icon: 'light_mode' },
  { mode: 'dark', label: t('Dark'), icon: 'dark_mode' },
  { mode: 'system', label: t('System default'), icon: 'contrast' },
];

/** Top app bar: branding on the left; theme selector and account menu on the right. Gains a tonal elevation once the page scrolls. */
function TopAppBar() {
  const { admin, logout } = useAuth();
  const { mode, setMode, resolved } = useTheme();
  const nav = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const initial = (admin?.display_name ?? '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <header className="topbar" data-scrolled={scrolled}>
      <div className="topbar-brand">
        <BrandMark size={32} />
        <span className="title-l">ClassReminder</span>
      </div>
      <span className="grow" />
      <MenuButton label={t('Theme')} trigger={<Icon name={resolved === 'dark' ? 'dark_mode' : 'light_mode'} />}>
        {(close) =>
          MODES.map((m) => (
            <MenuItem key={m.mode} icon={m.icon} checked={mode === m.mode} onClick={() => { setMode(m.mode); close(); }}>
              {m.label}
            </MenuItem>
          ))
        }
      </MenuButton>
      <MenuButton label={t('Account')} trigger={<Avatar src={admin?.avatar_url} name={admin?.display_name ?? initial} size="sm" />}>
        {(close) => (
          <>
            <div className="menu-head">
              <div className="title-s">{admin?.display_name}</div>
              <div className="body-s muted">{admin?.email}</div>
            </div>
            <MenuDivider />
            <MenuItem icon="person" onClick={() => { close(); nav('/profile'); }}>{t('Profile')}</MenuItem>
            <MenuItem icon="settings" onClick={() => { close(); nav('/settings'); }}>{t('Settings')}</MenuItem>
            <MenuDivider />
            <MenuItem icon="logout" onClick={() => { close(); void logout(); }}>{t('Sign out')}</MenuItem>
          </>
        )}
      </MenuButton>
    </header>
  );
}

export function Shell() {
  const { can, admin } = useAuth();
  const [more, setMore] = useState(false);
  const loc = useLocation();
  const items = ITEMS.filter((i) => !i.perm || can(i.perm));
  const bar = items.filter((i) => i.primary);
  const rest = items.filter((i) => !i.primary);
  const canCreate = can('reminders.create');
  const onForm = loc.pathname.startsWith('/reminders/');

  return (
    <div className="shell">
      <nav className="nav-rail" aria-label={t('Main')}>
        <div className="nav-rail-title"><BrandMark size={36} /><span className="title-m">ClassReminder</span></div>
        {canCreate && <Fab to="/reminders/new" icon="add" label={t('New')} />}
        {items.map((i) => (
          <NavItem key={i.to} item={i} />
        ))}
      </nav>

      <div className="shell-col">
        <TopAppBar />
        <main className="shell-main" id="main">
          <Outlet />
        </main>
      </div>

      {canCreate && !onForm && (
        <div className="mobile-fab">
          <Fab to="/reminders/new" icon="add" label={t('New')} />
        </div>
      )}

      <div className="gnav-host"><GlassNav bar={bar} rest={rest} moreOpen={more} onMore={() => setMore(true)} /></div>

      {more && (
        <BottomSheet title={admin?.display_name ?? t('More')} onClose={() => setMore(false)}>
          <div className="list">
            {rest.map((i) => (
              <NavLink key={i.to} to={i.to} className="list-item clickable" style={{ textDecoration: 'none', color: 'inherit' }} onClick={() => setMore(false)}>
                <Icon name={i.icon} />
                <span className="title-s">{i.label}</span>
              </NavLink>
            ))}
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
