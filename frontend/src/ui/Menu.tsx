import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** Material 3 menu: an anchored popup of actions. Closes on outside click, Escape, Tab, or after choosing an item. */
export function MenuButton({ trigger, label, children }: { trigger: ReactNode; label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const items = () => Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]') ?? []);
    (items().find((el) => el.getAttribute('aria-checked') === 'true') ?? items()[0])?.focus();
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        wrap.current?.querySelector<HTMLElement>('[aria-haspopup]')?.focus();
      } else if (e.key === 'Tab') setOpen(false);
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const list = items();
        const i = list.indexOf(document.activeElement as HTMLElement);
        const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
        list[next]?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu-wrap" ref={wrap}>
      <button type="button" className="menu-trigger" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} aria-label={label} title={label} onClick={() => setOpen((v) => !v)}>
        {trigger}
      </button>
      {open && (
        <div className="menu" role="menu" id={id} aria-label={label}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon, children, checked, onClick }: { icon?: IconName; children: ReactNode; checked?: boolean; onClick(): void }) {
  const radio = checked !== undefined;
  return (
    <button type="button" className="menu-item" role={radio ? 'menuitemradio' : 'menuitem'} aria-checked={radio ? checked : undefined} onClick={onClick}>
      {icon ? <Icon name={icon} size={20} /> : <span style={{ width: 20 }} />}
      <span className="grow">{children}</span>
      {checked && <Icon name="check" size={20} />}
    </button>
  );
}

export function MenuDivider() {
  return <div className="menu-divider" role="separator" />;
}
