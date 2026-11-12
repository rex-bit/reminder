import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../ui/Icon';
import { t } from '../i18n';

export interface GlassItem { to: string; label: string; icon: IconName }

/**
 * Floating liquid-glass tab bar (phones), same behaviour as Rolling Kelas:
 * the highlight pill slides and stretches between tabs, grows while pressed, and can be dragged with a finger.
 * The last slot ("More") opens the sheet with the remaining pages.
 */
export function GlassNav({ bar, rest, moreOpen, onMore }: { bar: GlassItem[]; rest: GlassItem[]; moreOpen: boolean; onMore(): void }) {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const hasMore = rest.length > 0;
  const n = bar.length + (hasMore ? 1 : 0);
  const at = (i: GlassItem) => (i.to === '/' ? pathname === '/' : pathname === i.to || pathname.startsWith(`${i.to}/`));

  let routeIdx = bar.findIndex(at);
  if (routeIdx < 0 && hasMore && rest.some(at)) routeIdx = n - 1;
  const active = moreOpen && hasMore ? n - 1 : routeIdx;

  const prev = useRef(active);
  const lastDir = useRef<'fwd' | 'back'>('fwd');
  if (active > prev.current) lastDir.current = 'fwd';
  else if (active < prev.current) lastDir.current = 'back';
  useEffect(() => { prev.current = active; });

  const [press, setPress] = useState(false);
  const [pos, setPos] = useState<number | null>(null); // fractional index while dragging
  const [moving, setMoving] = useState(false);
  const drag = useRef<{ x0: number; moved: boolean; idx: number; last: number } | null>(null);
  const tabsEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active < 0) return;
    setMoving(true);
    const id = setTimeout(() => setMoving(false), 650);
    return () => clearTimeout(id);
  }, [active]);

  const idxAt = (x: number) => {
    const r = tabsEl.current!.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.floor((x - r.left) / (r.width / n))));
  };

  const down = (e: PointerEvent) => {
    drag.current = { x0: e.clientX, moved: false, idx: idxAt(e.clientX), last: active };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    setPress(true);
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) > 5) d.moved = true;
    if (d.moved) {
      const r = tabsEl.current!.getBoundingClientRect();
      const c = Math.max(0, Math.min(n - 1, (e.clientX - r.left) / (r.width / n) - 0.5));
      setPos(c);
      const k = Math.round(c);
      if (k !== d.last) { d.last = k; try { navigator.vibrate?.(6); } catch { /* ignore */ } }
    }
  };
  const end = (e: PointerEvent, cancel: boolean) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setPress(false);
    setPos(null);
    let k = d.idx;
    if (d.moved) {
      const r = tabsEl.current!.getBoundingClientRect();
      k = Math.max(0, Math.min(n - 1, Math.round((e.clientX - r.left) / (r.width / n) - 0.5)));
    }
    if (cancel) return;
    if (hasMore && k === n - 1) onMore();
    else if (k < bar.length && k !== routeIdx) nav(bar[k]!.to);
  };

  const shown = pos ?? (active < 0 ? 0 : active);
  const hidden = pos === null && active < 0;
  const on = Math.round(shown);
  const labels: GlassItem[] = [...bar, ...(hasMore ? [{ to: '', label: t('More'), icon: 'more' as IconName }] : [])];

  return (
    <nav
      className={`gnav${press ? ' press' : ''}${pos !== null ? ' drag' : ''}${moving && !press ? ' moving' : ''}`}
      aria-label={t('Main')}
      style={{ ['--n' as string]: n, ['--i' as string]: shown }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={(e) => end(e, false)}
      onPointerCancel={(e) => end(e, true)}
    >
      <div className="gtabs" ref={tabsEl}>
        <div className={`gpill ${pos !== null ? '' : lastDir.current}`} style={hidden ? { opacity: 0 } : undefined} />
        {labels.map((l, i) => (
          <button
            key={l.to || 'more'}
            type="button"
            className={`gtab${!hidden && i === on ? ' on' : ''}`}
            aria-current={i === routeIdx && !moreOpen ? 'page' : undefined}
            onClick={(e) => { if (e.detail === 0) { if (hasMore && i === n - 1) onMore(); else nav(l.to); } }}
          >
            <Icon name={l.icon} size={20} />
            <span>{l.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
