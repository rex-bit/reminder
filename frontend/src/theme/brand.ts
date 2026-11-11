import { buildScheme } from './palette';

/** App icon: a bell with a "done" badge. Colors follow the theme seed so the icon always matches the accent color. */
export interface BrandColors {
  from: string;
  to: string;
  fg: string;
  accent: string;
  onAccent: string;
}

function mix(hex: string, other: string, t: number): string {
  const a = hex.replace('#', '');
  const b = other.replace('#', '');
  const c = (i: number) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t);
  return `#${[0, 2, 4].map((i) => c(i).toString(16).padStart(2, '0')).join('')}`;
}

export function brandColors(seed: string): BrandColors {
  // Always built from the light scheme, so the icon looks the same in light and dark mode.
  const s = buildScheme(seed, 'light');
  const p = s.primary ?? seed;
  return {
    from: mix(p, '#ffffff', 0.12),
    to: mix(p, '#000000', 0.42),
    fg: '#ffffff',
    accent: s['tertiary-container'] ?? '#ffd8e4',
    onAccent: s['on-tertiary-container'] ?? '#31111d',
  };
}

/** `shape`: rounded square (favicon, in-app), full-bleed square (home screen icons that the OS rounds itself). */
export function brandSvg(c: BrandColors, shape: 'rounded' | 'square' = 'rounded', id = 'cr'): string {
  const rx = shape === 'rounded' ? 116 : 0;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.from}"/><stop offset="1" stop-color="${c.to}"/></linearGradient>` +
    `<clipPath id="${id}c"><rect width="512" height="512" rx="${rx}"/></clipPath></defs>` +
    `<rect width="512" height="512" rx="${rx}" fill="url(#${id})"/>` +
    `<g clip-path="url(#${id}c)"><circle cx="440" cy="64" r="200" fill="#fff" opacity=".10"/><circle cx="52" cy="486" r="150" fill="#fff" opacity=".07"/></g>` +
    `<g fill="${c.fg}"><circle cx="248" cy="112" r="18"/>` +
    `<path d="M248 136C188 136 152 182 152 244V298C152 328 140 346 114 366V388H382V366C356 346 344 328 344 298V244C344 182 308 136 248 136Z"/>` +
    `<path d="M210 402H286A38 38 0 0 1 210 402Z"/></g>` +
    `<circle cx="376" cy="148" r="62" fill="${c.accent}" stroke="${c.to}" stroke-width="14"/>` +
    `<path d="M350 150L370 170L404 128" fill="none" stroke="${c.onAccent}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function setLink(rel: string, href: string, type?: string) {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  if (type) el.type = type;
  el.href = href;
}

/** Browser tab icon and the iOS "Add to Home Screen" icon follow the accent color. (An icon that is already installed keeps its color.) */
export function applyBrandIcons(seed: string): void {
  try {
    const c = brandColors(seed);
    setLink('icon', svgDataUrl(brandSvg(c, 'rounded', 'fav')), 'image/svg+xml');
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 180;
        canvas.getContext('2d')?.drawImage(img, 0, 0, 180, 180);
        setLink('apple-touch-icon', canvas.toDataURL('image/png'));
      } catch {
        /* canvas unavailable: keep the static icon */
      }
    };
    img.src = svgDataUrl(brandSvg(c, 'square', 'apl'));
  } catch {
    /* icons are cosmetic */
  }
}
