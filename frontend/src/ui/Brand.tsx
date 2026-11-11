import { useId, useMemo } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { brandColors, brandSvg } from '../theme/brand';

/** The app icon, drawn inline in the current accent color. */
export function BrandMark({ size = 32 }: { size?: number }) {
  const { seed } = useTheme();
  // Gradient ids must be unique per instance: an id inside a hidden copy (e.g. the desktop rail on a phone) would break every other copy.
  const uid = `bm${useId().replace(/\W/g, '')}`;
  const html = useMemo(() => brandSvg(brandColors(seed), 'rounded', uid), [seed, uid]);
  return <span className="brand-mark" style={{ width: size, height: size }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;
}
