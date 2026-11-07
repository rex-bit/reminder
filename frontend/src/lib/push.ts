import { api } from '../api/client';

const BASE = import.meta.env.BASE_URL ?? '/';

export type PushState = 'unsupported' | 'server-disabled' | 'denied' | 'off' | 'on';

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** iPhone/iPad only deliver web push to an app that was added to the Home Screen. */
export function needsHomeScreenInstall(): boolean {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
  return ios && !standalone;
}

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  return navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE });
}

export async function getPushState(): Promise<{ state: PushState; devices: number }> {
  if (!pushSupported()) return { state: 'unsupported', devices: 0 };
  const cfg = await api<{ enabled: boolean; publicKey: string | null; devices: number }>('/push/config');
  if (!cfg.enabled) return { state: 'server-disabled', devices: cfg.devices };
  if (Notification.permission === 'denied') return { state: 'denied', devices: cfg.devices };
  const reg = await navigator.serviceWorker.getRegistration(BASE);
  const sub = await reg?.pushManager.getSubscription();
  return { state: sub && Notification.permission === 'granted' ? 'on' : 'off', devices: cfg.devices };
}

export async function enablePush(): Promise<void> {
  const cfg = await api<{ enabled: boolean; publicKey: string | null }>('/push/config');
  if (!cfg.enabled || !cfg.publicKey) throw new Error('Push notifications are not configured on the server.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted. Allow notifications for this site in your browser settings.');
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(cfg.publicKey) as unknown as BufferSource }));
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api('/push/subscribe', { method: 'POST', body: { endpoint: json.endpoint, keys: json.keys } });
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration(BASE);
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => undefined);
  await sub.unsubscribe();
}

export const sendTestPush = () => api<{ sent: number }>('/push/test', { method: 'POST' });
