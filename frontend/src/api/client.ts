import type { Admin } from './types';

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;
let refreshing: Promise<boolean> | null = null;

export const setAccessToken = (t: string | null) => {
  accessToken = t;
};
export const setSessionLostHandler = (fn: (() => void) | null) => {
  onSessionLost = fn;
};

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string; details?: unknown } };
    return new ApiError(res.status, body.error?.code ?? 'error', body.error?.message ?? `Request failed (${res.status})`, body.error?.details);
  } catch {
    return new ApiError(res.status, 'error', `Request failed (${res.status})`);
  }
}

/** Uses the httpOnly refresh cookie. Concurrent callers share one refresh request. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Requested-With': 'reminder-web' },
      });
      if (!res.ok) return false;
      const body = (await res.json()) as { accessToken: string };
      accessToken = body.accessToken;
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

interface Opts {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  auth?: boolean;
}

export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const send = () =>
    fetch(url, {
      method: opts.method ?? 'GET',
      credentials: 'include',
      signal: opts.signal,
      headers: {
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        'X-Requested-With': 'reminder-web',
        ...(opts.auth !== false && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && opts.auth !== false) {
      if (await refreshSession()) res = await send();
      else {
        accessToken = null;
        onSessionLost?.();
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'network_error', 'Cannot reach the server. Check your connection and the API URL.');
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function loginRequest(identifier: string, password: string) {
  const res = await api<{ accessToken: string; admin: Admin }>('/auth/login', {
    method: 'POST',
    body: { identifier, password },
    auth: false,
  });
  accessToken = res.accessToken;
  return res.admin;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'validation_error' && Array.isArray(err.details)) {
      return (err.details as { path: string; message: string }[]).map((d) => `${d.path}: ${d.message}`).join('; ');
    }
    return err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}
