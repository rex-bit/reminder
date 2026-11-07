/** Timezone helpers built on Intl (no extra dependency). */

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function parts(date: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  return Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value])) as Record<string, string>;
}

/** Wall-clock date (YYYY-MM-DD) and time (HH:mm) -> UTC instant, in `tz`. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  const p = parts(new Date(guess), tz);
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return new Date(guess - (asUtc - guess));
}

export function utcToZoned(date: Date, tz: string): { date: string; time: string } {
  const p = parts(date, tz);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** Calendar math on YYYY-MM-DD strings. Month steps clamp to the last day of the month. */
export function addToDate(date: string, unit: 'daily' | 'weekly' | 'monthly'): string {
  const [y, m, d] = date.split('-').map(Number);
  if (unit === 'daily' || unit === 'weekly') {
    const t = new Date(Date.UTC(y!, m! - 1, d! + (unit === 'daily' ? 1 : 7)));
    return t.toISOString().slice(0, 10);
  }
  const first = new Date(Date.UTC(y!, m!, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d!, last))).toISOString().slice(0, 10);
}
