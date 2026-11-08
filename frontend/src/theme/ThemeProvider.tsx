import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildScheme, SEED_PRESETS } from './palette';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  seed: string;
  resolved: 'light' | 'dark';
  setMode(mode: ThemeMode): void;
  setSeed(hex: string): void;
}

const Ctx = createContext<ThemeState | null>(null);

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: preference is kept for this session only */
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const v = read('theme.mode');
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  });
  const [seed, setSeedState] = useState<string>(() => {
    const v = read('theme.seed');
    return v && /^#[0-9a-f]{6}$/i.test(v) ? v : (SEED_PRESETS[0]?.hex ?? '#6750a4');
  });
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved: 'light' | 'dark' = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    const scheme = buildScheme(seed, resolved);
    const root = document.documentElement;
    for (const [k, v] of Object.entries(scheme)) root.style.setProperty(`--md-${k}`, v);
    root.style.colorScheme = resolved;
    // The page behind/around the app (iOS overscroll, safe areas) must follow the theme, not the value chosen at first load.
    root.style.backgroundColor = scheme.background ?? scheme.surface ?? '';
    root.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', scheme.surface ?? '#ffffff');
  }, [seed, resolved]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    write('theme.mode', m);
  }, []);
  const setSeed = useCallback((hex: string) => {
    setSeedState(hex);
    write('theme.seed', hex);
  }, []);

  const value = useMemo(() => ({ mode, seed, resolved, setMode, setSeed }), [mode, seed, resolved, setMode, setSeed]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme outside ThemeProvider');
  return v;
}
