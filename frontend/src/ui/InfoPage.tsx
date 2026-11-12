import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { usePageMeta } from '../lib/usePageMeta';
import { BrandMark } from './Brand';
import { Icon, type IconName } from './Icon';

export const INFO_LINKS = [
  { to: '/about', label: 'Tentang' },
  { to: '/changelog', label: 'Changelog' },
  { to: '/roadmap', label: 'Roadmap' },
  { to: '/terms', label: 'Syarat Layanan' },
  { to: '/privacy', label: 'Privasi' },
];

/** Footer links shared by the public page and every information page. */
export function InfoLinks({ className = '' }: { className?: string }) {
  return (
    <nav className={`info-links ${className}`} aria-label="Informasi">
      {INFO_LINKS.map((l) => (
        <NavLink key={l.to} to={l.to}>{l.label}</NavLink>
      ))}
    </nav>
  );
}

/** Shared layout for About / Terms / Changelog / Roadmap: brand bar, title hero, content, footer navigation. */
export function InfoPage({ title, description, icon, updated, wide, children }: { title: string; description: string; icon: IconName; updated?: string; wide?: boolean; children: ReactNode }) {
  usePageMeta(title, description);
  return (
    <div className="infopage">
      <header className="info-bar">
        <Link to="/" className="info-brand" aria-label="Class Reminder, kembali ke beranda">
          <BrandMark size={32} />
          <span className="title-m">Class Reminder</span>
        </Link>
      </header>
      <main className={`info-main${wide ? ' wide' : ''}`}>
        <section className="info-hero">
          <span className="info-ico" aria-hidden="true"><Icon name={icon} size={28} /></span>
          <h1 className="headline-m">{title}</h1>
          <p className="body-l muted">{description}</p>
          {updated && <p className="body-s muted">Terakhir diperbarui: {updated}</p>}
        </section>
        {children}
      </main>
      <footer className="info-foot">
        <InfoLinks />
        <p className="body-s muted"><Link to="/">← Kembali ke beranda</Link></p>
      </footer>
    </div>
  );
}
