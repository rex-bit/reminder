/** Photo helpers. Uses data: URLs only (CSP allows data:, not blob:). */
export const CROP_VIEW = 240;
const OUT = 192;

export function readImage(file: File): Promise<HTMLImageElement> {
  if (!file.type.startsWith('image/')) return Promise.reject(new Error('not-image'));
  return new Promise((ok, bad) => {
    const r = new FileReader();
    r.onerror = () => bad(new Error('read'));
    r.onload = () => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => bad(new Error('bad-image'));
      i.src = String(r.result);
    };
    r.readAsDataURL(file);
  });
}

/** Displayed image size in the square crop view at a given zoom (1 = just covers the view). */
export function fitSize(img: { width: number; height: number }, zoom: number) {
  const s = Math.max(CROP_VIEW / img.width, CROP_VIEW / img.height) * zoom;
  return { w: img.width * s, h: img.height * s };
}

export function clampOffset(img: { width: number; height: number }, zoom: number, x: number, y: number) {
  const { w, h } = fitSize(img, zoom);
  const mx = (w - CROP_VIEW) / 2, my = (h - CROP_VIEW) / 2;
  return { x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
}

/** Render the visible crop to a small JPEG data URL. ox/oy are offsets of the image centre from the view centre. */
export function cropToAvatar(img: HTMLImageElement, zoom: number, ox: number, oy: number): string {
  const k = OUT / CROP_VIEW;
  const { w, h } = fitSize(img, zoom);
  const c = document.createElement('canvas');
  c.width = OUT; c.height = OUT;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, OUT, OUT);
  ctx.drawImage(img, OUT / 2 - (w * k) / 2 + ox * k, OUT / 2 - (h * k) / 2 + oy * k, w * k, h * k);
  return c.toDataURL('image/jpeg', 0.8);
}
