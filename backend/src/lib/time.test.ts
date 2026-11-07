import { describe, expect, it } from 'vitest';
import { addToDate, isValidTimezone, utcToZoned, zonedToUtc } from './time';
import { buildMessage } from './message';

describe('time', () => {
  it('converts wall-clock time in a zone to UTC and back', () => {
    const d = zonedToUtc('2026-11-09', '06:00', 'Asia/Kuala_Lumpur');
    expect(d.toISOString()).toBe('2026-11-08T22:00:00.000Z');
    expect(utcToZoned(d, 'Asia/Kuala_Lumpur')).toEqual({ date: '2026-11-09', time: '06:00' });
  });
  it('clamps monthly recurrence to the end of the month', () => {
    expect(addToDate('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(addToDate('2026-12-31', 'monthly')).toBe('2027-01-31');
    expect(addToDate('2026-12-31', 'daily')).toBe('2027-01-01');
    expect(addToDate('2026-02-27', 'weekly')).toBe('2026-03-06');
  });
  it('validates timezones', () => {
    expect(isValidTimezone('Asia/Jakarta')).toBe(true);
    expect(isValidTimezone('Mars/Base')).toBe(false);
  });
});

describe('message', () => {
  it('sends a custom message exactly as written', () => {
    const m = buildMessage({ title: 'x', kind: 'daily', reminder_date: '2026-11-09', custom_message: 'Halo', content: {} });
    expect(m).toBe('Halo');
  });
  it('marks emergencies', () => {
    const m = buildMessage({ title: 'Libur', kind: 'emergency', reminder_date: '2026-11-09', custom_message: null, content: {} });
    expect(m.startsWith('🚨')).toBe(true);
  });
});
