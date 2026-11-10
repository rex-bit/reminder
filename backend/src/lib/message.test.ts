import { describe, expect, it } from 'vitest';
import { buildMessage } from './message';

describe('buildMessage', () => {
  it('matches the class template', () => {
    const text = buildMessage({
      title: 'Reminder',
      kind: 'daily',
      reminder_date: '2026-11-10',
      custom_message: null,
      content: {
        uniform: '*cowok*: baju batik\n*cewek* : kerudung putih',
        subjects: [
          { time: '10:55 - 12:15', subject: 'Informatika' },
          { time: '12:15 - 12:55', subject: 'IPS' },
          { time: '12:55 - 13:40', subject: 'istirahat' },
          { time: '14:20 - 16:20', subject: 'B.indonesia' },
        ],
        homework: [{ subject: 'IPS', task: 'membuat video', due: 'hari kamis' }, { subject: 'informatika', task: 'latihan soal' }],
        piket: [{ name: 'Bunga' }, { name: 'Natasya' }],
        notes: '• jangan lupa piket',
        announcements: '‼️ informatika *ULANGAN*',
      },
    });
    expect(text).toBe(
      [
        '‼️*REMINDER*‼️',
        'Selasa, 10 November 2026',
        '',
        '👔*SERAGAM*',
        '*cowok*: baju batik',
        '*cewek* : kerudung putih',
        '',
        '📚*MAPEL*',
        '1.Informatika (10:55 - 12:15)',
        '2.IPS (12:15 - 12:55)',
        'istirahat (12:55 - 13:40)',
        '3.B.indonesia (14:20 - 16:20)',
        '',
        '📝*TUGAS*',
        '• IPS : membuat video',
        '*deadline hari kamis*',
        '• informatika : latihan soal',
        '',
        '🧹*PIKET*',
        '1.Bunga',
        '2.Natasya',
        '',
        '📌*CATATAN*',
        '• jangan lupa piket',
        '‼️ informatika *ULANGAN*',
      ].join('\n'),
    );
  });

  it('sends a custom message exactly as written', () => {
    expect(buildMessage({ title: 't', kind: 'daily', reminder_date: '2026-11-10', custom_message: 'hello', content: {} })).toBe('hello');
  });

  it('does not renumber a lesson that continues after the break', () => {
    const text = buildMessage({
      title: 'Reminder', kind: 'daily', reminder_date: '2026-11-10', custom_message: null,
      content: { subjects: [
        { time: '12:15 - 12:55', subject: 'IPS' },
        { time: '12:55 - 13:40', subject: 'istirahat' },
        { time: '13:40 - 14:20', subject: 'IPS' },
        { time: '14:20 - 16:20', subject: 'B.indonesia' },
      ] },
    });
    expect(text).toContain('1.IPS (12:15 - 12:55)\nistirahat (12:55 - 13:40)\nIPS (13:40 - 14:20)\n2.B.indonesia (14:20 - 16:20)');
  });
});
