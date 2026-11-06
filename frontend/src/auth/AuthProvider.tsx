import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, loginRequest, refreshSession, setAccessToken, setSessionLostHandler } from '../api/client';
import type { Admin } from '../api/types';

interface AuthState {
  admin: Admin | null;
  loading: boolean;
  login(identifier: string, password: string): Promise<void>;
  logout(): Promise<void>;
  reloadMe(): Promise<void>;
  can(permission: string): boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    const res = await api<{ admin: Admin }>('/auth/me');
    setAdmin(res.admin);
  }, []);

  useEffect(() => {
    setSessionLostHandler(() => setAdmin(null));
    let cancelled = false;
    (async () => {
      try {
        if (await refreshSession()) await fetchMe();
      } catch {
        /* not signed in */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      setSessionLostHandler(null);
    };
  }, [fetchMe]);

  const login = useCallback(async (identifier: string, password: string) => {
    setAdmin(await loginRequest(identifier, password));
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken(null);
      setAdmin(null);
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      admin,
      loading,
      login,
      logout,
      reloadMe: fetchMe,
      can: (p) => !!admin && (admin.role_key === 'owner' || admin.permissions.includes(p)),
    }),
    [admin, loading, login, logout, fetchMe],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
