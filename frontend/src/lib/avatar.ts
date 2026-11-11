/** Resize a picked image to a small square JPEG data URL (<= ~20 KB) for upload. Uses data: URLs (CSP allows data:, not blob:). */
export async function imageToAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not-image');
  const src = await new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => bad(new Error('read')); r.readAsDataURL(file); });
  const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('bad-image')); i.src = src; });
  const S = 192;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const side = Math.min(img.width, img.height);
  c.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
  return c.toDataURL('image/jpeg', 0.8);
}
