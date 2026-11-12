import { useEffect, useRef, useState } from 'react';

export const REFRESH_EVENT = 'cr:refresh';

/** Phones: pull down from the top of any page to reload its data. Pages listen through useAsync. */
export function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef<{ y: number; x: number } | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    const top = () => (document.scrollingElement?.scrollTop ?? window.scrollY) <= 0;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || !top() || document.querySelector('.scrim, .sheet')) { start.current = null; return; }
      start.current = { y: e.touches[0]!.clientY, x: e.touches[0]!.clientX };
    };
    const onMove = (e: TouchEvent) => {
      const s = start.current;
      if (!s) return;
      const dy = e.touches[0]!.clientY - s.y, dx = Math.abs(e.touches[0]!.clientX - s.x);
      if (dy <= 0 || dx > dy || !top()) { pullRef.current = 0; setPull(0); return; }
      pullRef.current = Math.min(90, dy * 0.5);
      setPull(pullRef.current);
    };
    const onEnd = () => {
      const fire = pullRef.current >= 56;
      start.current = null;
      pullRef.current = 0;
      setPull(0);
      if (fire) {
        setBusy(true);
        window.dispatchEvent(new Event(REFRESH_EVENT));
        setTimeout(() => setBusy(false), 900);
      }
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  const shown = busy ? 48 : pull;
  if (shown <= 0) return null;
  return (
    <div className="ptr" style={{ transform: `translate(-50%, ${shown - 8}px)`, opacity: Math.min(1, shown / 40) }} aria-hidden="true">
      <div className={`ptr-dot${busy ? ' spin' : ''}`} style={busy ? undefined : { transform: `rotate(${pull * 6}deg)` }} />
    </div>
  );
}
