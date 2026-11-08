import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Fab } from '../ui/controls';
import { Icon, type IconName } from '../ui/Icon';
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
        <div className="nav-rail-title title-m">Reminder</div>
        {canCreate && <Fab to="/reminders/new" icon="add" label={t('New')} />}
        {items.map((i) => (
          <NavItem key={i.to} item={i} />
        ))}
      </nav>

      <main className="shell-main" id="main">
        <Outlet />
      </main>

      {canCreate && !onForm && (
        <div className="mobile-fab">
          <Fab to="/reminders/new" icon="add" label={t('New')} />
        </div>
      )}

      <nav className="nav-bar" aria-label={t('Main')}>
        {bar.map((i) => (
          <NavItem key={i.to} item={i} />
        ))}
        {rest.length > 0 && (
          <button className="nav-item" onClick={() => setMore(true)} aria-haspopup="dialog">
            <span className="nav-pill">
              <Icon name="more" />
            </span>
            <span className="label-m">{t('More')}</span>
          </button>
        )}
      </nav>

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
