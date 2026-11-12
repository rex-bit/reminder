import { useRef, useState, type ReactNode, type PointerEvent } from 'react';

const TRAY = 148;

/** Phone-only: swipe a row to the left to reveal quick actions (tray), swipe right or tap elsewhere to close. */
export function SwipeRow({ tray, children }: { tray: ReactNode; children: ReactNode }) {
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const st = useRef<{ x0: number; y0: number; base: number; mode: 'idle' | 'h' | 'v' } | null>(null);

  const down = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    st.current = { x0: e.clientX, y0: e.clientY, base: x, mode: 'idle' };
  };
  const move = (e: PointerEvent) => {
    const s = st.current;
    if (!s) return;
    const dx = e.clientX - s.x0, dy = e.clientY - s.y0;
    if (s.mode === 'idle') {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) { s.mode = 'h'; setDragging(true); try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ } }
      else if (Math.abs(dy) > 10) s.mode = 'v';
    }
    if (s.mode === 'h') setX(Math.max(-TRAY - 24, Math.min(0, s.base + dx)));
  };
  const up = () => {
    const s = st.current;
    st.current = null;
    setDragging(false);
    if (s?.mode === 'h') setX((cur) => (cur < -TRAY / 2 ? -TRAY : 0));
  };
  // A click right after a horizontal drag must not open the card.
  const swallow = (e: React.MouseEvent) => { if (x !== 0) { e.stopPropagation(); e.preventDefault(); setX(0); } };

  return (
    <div className="swipe">
      <div className="swipe-tray" style={{ width: TRAY }} aria-hidden={x === 0} onClick={() => setX(0)}>{tray}</div>
      <div className={`swipe-body${dragging ? ' dragging' : ''}`} style={{ transform: `translateX(${x}px)` }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClickCapture={swallow}>
        {children}
      </div>
    </div>
  );
}
