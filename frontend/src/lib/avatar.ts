/** Profile photo, kept only in this browser (no server storage). Resized to a small square JPEG. */
const key = (id: string) => `cr.avatar.${id}`;
const EVT = 'cr-avatar';

export function getAvatar(id: string): string | null {
  try { return localStorage.getItem(key(id)); } catch { return null; }
}

export function removeAvatar(id: string): void {
  try { localStorage.removeItem(key(id)); } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVT));
}

export async function setAvatarFromFile(id: string, file: File): Promise<void> {
  if (!file.type.startsWith('image/')) throw new Error('not-image');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('bad-image')); i.src = url; });
    const S = 256;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const side = Math.min(img.width, img.height);
    c.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
    localStorage.setItem(key(id), c.toDataURL('image/jpeg', 0.85));
    window.dispatchEvent(new Event(EVT));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const AVATAR_EVENT = EVT;
