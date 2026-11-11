import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Bridges React 18 and web components: React 18 stringifies props on custom elements
 * (so `disabled={false}` would still disable). Values are therefore set as element properties,
 * and events are attached with addEventListener.
 */
export function useMd<E extends HTMLElement = HTMLElement>(props: Record<string, unknown>, events: Record<string, ((e: Event) => void) | undefined> = {}) {
  const ref = useRef<E>(null);
  useLayoutEffect(() => {
    const el = ref.current as unknown as Record<string, unknown> | null;
    if (!el) return;
    for (const k of Object.keys(props)) if (el[k] !== props[k]) el[k] = props[k];
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const offs = Object.entries(events).flatMap(([name, fn]) => {
      if (!fn) return [];
      el.addEventListener(name, fn);
      return [() => el.removeEventListener(name, fn)];
    });
    return () => offs.forEach((off) => off());
  });
  return ref;
}
