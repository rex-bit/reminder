import { z } from 'zod';
import { isValidTimezone } from '../../lib/time';

const text = (max: number) => z.string().trim().max(max);

export const contentSchema = z.object({
  uniform: text(300).default(''),
  subjects: z.array(z.object({ time: text(40).optional(), subject: text(120).min(1), teacher: text(120).optional() })).max(30).default([]),
  homework: z.array(z.object({ subject: text(120).min(1), task: text(500).min(1), due: text(60).optional() })).max(30).default([]),
  piket: z.array(z.object({ name: text(120).min(1), area: text(120).optional() })).max(40).default([]),
  notes: text(2000).default(''),
  announcements: text(2000).default(''),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((d) => !Number.isNaN(Date.parse(d)), 'Invalid date');

export const reminderInput = z
  .object({
    title: text(160).min(1, 'Title is required'),
    kind: z.enum(['daily', 'emergency']).default('daily'),
    reminder_date: isoDate,
    content: contentSchema.default({}),
    custom_message: z.string().max(4000).nullable().default(null),
    template_id: z.string().uuid().nullable().default(null),
    timezone: z.string().refine(isValidTimezone, 'Invalid IANA timezone'),
    recurrence: z.enum(['none', 'daily', 'weekly', 'monthly']).default('none'),
    recurrence_until: isoDate.nullable().default(null),
    recipient_ids: z.array(z.string().uuid()).max(100).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.recurrence_until && v.recurrence_until < v.reminder_date) {
      ctx.addIssue({ code: 'custom', path: ['recurrence_until'], message: 'Must be on or after the reminder date' });
    }
  });
export type ReminderInput = z.infer<typeof reminderInput>;

export const idParams = z.object({ id: z.string().uuid() });

export const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  status: z
    .string()
    .regex(/^(draft|pending|due|sent|failed|cancelled)(,(draft|pending|due|sent|failed|cancelled))*$/)
    .optional(),
  kind: z.enum(['daily', 'emergency']).optional(),
  sort: z.enum(['scheduled_at', '-scheduled_at', 'reminder_date', '-reminder_date', 'updated_at', '-updated_at']).default('-updated_at'),
});

export const scheduleBody = z.object({ scheduledAt: z.string().datetime() });
