/** Material 3 touch ripple: a soft circle that grows from the press point. Pure decoration, never blocks clicks. */
const SELECTOR = '.btn, .fab, .chip, .seg button, .nav-item, .list-item.clickable, .card.clickable, .snack button';

export function initRipple(): void {
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0) return;
      const el = (e.target as Element | null)?.closest<HTMLElement>(SELECTOR);
      if (!el || el.matches(':disabled, [aria-disabled="true"]')) return;
      // On navigation items the ripple lives inside the indicator pill, like in M3.
      const host = el.classList.contains('nav-item') ? el.querySelector<HTMLElement>('.nav-pill') : el;
      if (!host) return;
      const r = host.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 2;
      const dot = document.createElement('span');
      dot.className = 'ripple';
      dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
      host.appendChild(dot);
      dot.addEventListener('animationend', () => dot.remove(), { once: true });
    },
    { passive: true },
  );
}
