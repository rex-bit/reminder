/**
 * Dynamic color: builds a Material 3 style tonal palette from one seed color.
 * Implemented with OKLCH (no external dependency). It follows the M3 role mapping but is an
 * approximation of Google's HCT algorithm, so shades differ slightly from Material Theme Builder.
 */

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
};

function rgbToOklch([r, g, b]: Rgb): { l: number; c: number; h: number } {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
}

function oklchToLinear(L: number, C: number, H: number): Rgb {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -0.0005 && v <= 1.0005);

/** Perceptual tone (0-100, like CIE L*) -> OKLab lightness. */
function toneToL(tone: number): number {
  if (tone <= 0) return 0;
  if (tone >= 100) return 1;
  const y = tone > 8 ? ((tone + 16) / 116) ** 3 : tone / 903.2963;
  return Math.cbrt(y);
}

function toHex(L: number, C: number, H: number): string {
  let chroma = C;
  let lin = oklchToLinear(L, chroma, H);
  for (let i = 0; i < 24 && !inGamut(lin); i++) {
    chroma *= 0.92;
    lin = oklchToLinear(L, chroma, H);
  }
  return '#' + lin.map((v) => fromLinear(v).toString(16).padStart(2, '0')).join('');
}

export interface TonalPalette {
  tone(t: number): string;
}

function tonal(hue: number, chroma: number): TonalPalette {
  return { tone: (t) => toHex(toneToL(t), t >= 98 || t <= 2 ? chroma * 0.15 : chroma, hue) };
}

export type SchemeMode = 'light' | 'dark';
export type Scheme = Record<string, string>;

export function buildScheme(seedHex: string, mode: SchemeMode): Scheme {
  const seed = rgbToOklch(hexToRgb(seedHex));
  const h = seed.h;
  const chroma = Math.min(Math.max(seed.c, 0.1), 0.2);
  const primary = tonal(h, chroma);
  const secondary = tonal(h, chroma * 0.36);
  const tertiary = tonal((h + 60) % 360, chroma * 0.6);
  const neutral = tonal(h, 0.012);
  const neutralVariant = tonal(h, 0.022);
  const error = tonal(27, 0.19);
  const light = mode === 'light';
  const p = (a: number, b: number) => (light ? a : b);

  return {
    primary: primary.tone(p(40, 80)),
    'on-primary': primary.tone(p(100, 20)),
    'primary-container': primary.tone(p(90, 30)),
    'on-primary-container': primary.tone(p(10, 90)),
    secondary: secondary.tone(p(40, 80)),
    'on-secondary': secondary.tone(p(100, 20)),
    'secondary-container': secondary.tone(p(90, 30)),
    'on-secondary-container': secondary.tone(p(10, 90)),
    tertiary: tertiary.tone(p(40, 80)),
    'on-tertiary': tertiary.tone(p(100, 20)),
    'tertiary-container': tertiary.tone(p(90, 30)),
    'on-tertiary-container': tertiary.tone(p(10, 90)),
    error: error.tone(p(40, 80)),
    'on-error': error.tone(p(100, 20)),
    'error-container': error.tone(p(90, 30)),
    'on-error-container': error.tone(p(10, 90)),
    background: neutral.tone(p(98, 6)),
    'on-background': neutral.tone(p(10, 90)),
    surface: neutral.tone(p(98, 6)),
    'on-surface': neutral.tone(p(10, 90)),
    'surface-variant': neutralVariant.tone(p(90, 30)),
    'on-surface-variant': neutralVariant.tone(p(30, 80)),
    'surface-container-lowest': neutral.tone(p(100, 4)),
    'surface-container-low': neutral.tone(p(96, 10)),
    'surface-container': neutral.tone(p(94, 12)),
    'surface-container-high': neutral.tone(p(92, 17)),
    'surface-container-highest': neutral.tone(p(90, 22)),
    outline: neutralVariant.tone(p(50, 60)),
    'outline-variant': neutralVariant.tone(p(80, 30)),
    'inverse-surface': neutral.tone(p(20, 90)),
    'inverse-on-surface': neutral.tone(p(95, 20)),
    'inverse-primary': primary.tone(p(80, 40)),
    scrim: '#000000',
    // Semantic extras for delivery status (green-ish), not part of core M3 roles.
    success: tonal(150, 0.14).tone(p(40, 80)),
    'success-container': tonal(150, 0.14).tone(p(90, 30)),
    'on-success-container': tonal(150, 0.14).tone(p(10, 90)),
    warning: tonal(75, 0.15).tone(p(40, 80)),
    'warning-container': tonal(75, 0.15).tone(p(90, 30)),
    'on-warning-container': tonal(75, 0.15).tone(p(10, 90)),
  };
}

export const SEED_PRESETS: { name: string; hex: string }[] = [
  { name: 'Violet', hex: '#6750a4' },
  { name: 'Blue', hex: '#1b6ef3' },
  { name: 'Teal', hex: '#00897b' },
  { name: 'Green', hex: '#3f8f3f' },
  { name: 'Orange', hex: '#e8710a' },
  { name: 'Rose', hex: '#d6336c' },
];
