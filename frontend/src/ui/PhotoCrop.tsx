import { useRef, useState, type PointerEvent } from 'react';
import { clampOffset, cropToAvatar, CROP_VIEW, fitSize } from '../lib/avatar';
import { Button } from './controls';
import { Dialog } from './overlay';
import { t } from '../i18n';

export function PhotoCrop({ img, onCancel, onSave }: { img: HTMLImageElement; onCancel(): void; onSave(dataUrl: string): Promise<void> | void }) {
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const { w, h } = fitSize(img, zoom);

  const down = (e: PointerEvent) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y }; };
  const move = (e: PointerEvent) => { const d = drag.current; if (d) setPos(clampOffset(img, zoom, d.x + e.clientX - d.px, d.y + e.clientY - d.py)); };
  const up = () => { drag.current = null; };
  const changeZoom = (z: number) => { setZoom(z); setPos((p) => clampOffset(img, z, p.x, p.y)); };

  async function save() {
    setBusy(true);
    try { await onSave(cropToAvatar(img, zoom, pos.x, pos.y)); } finally { setBusy(false); }
  }

  return (
    <Dialog title={t('Adjust photo')} onClose={onCancel} actions={<><Button variant="text" onClick={onCancel}>{t('Cancel')}</Button><Button loading={busy} onClick={save}>{t('Save')}</Button></>}>
      <div className="crop-view" style={{ width: CROP_VIEW, height: CROP_VIEW }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <img src={img.src} alt="" draggable={false} style={{ width: w, height: h, transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }} />
        <div className="crop-ring" />
      </div>
      <label className="crop-zoom">
        <span className="body-s muted">{t('Zoom')}</span>
        <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => changeZoom(Number(e.target.value))} aria-label={t('Zoom')} />
      </label>
      <p className="body-s muted" style={{ textAlign: 'center' }}>{t('Drag the photo to reposition it.')}</p>
    </Dialog>
  );
}
