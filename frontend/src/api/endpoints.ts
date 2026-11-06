import { api } from './client';
import type {
  ActivityLog, Admin, AppSettings, DeliveryLog, Page, PermissionDef, Recipient, Reminder, ReminderInput, ReminderStatus, Template,
} from './types';

type Q = Record<string, string | number | boolean | undefined | null>;
const list = <T>(path: string, query?: Q, signal?: AbortSignal) => api<Page<T>>(path, { query, signal });

export const remindersApi = {
  list: (q: Q, signal?: AbortSignal) => list<Reminder>('/reminders', q, signal),
  get: (id: string, signal?: AbortSignal) => api<{ reminder: Reminder }>(`/reminders/${id}`, { signal }).then((r) => r.reminder),
  create: (b: ReminderInput) => api<{ reminder: Reminder }>('/reminders', { method: 'POST', body: b }).then((r) => r.reminder),
  update: (id: string, b: ReminderInput) => api<{ reminder: Reminder }>(`/reminders/${id}`, { method: 'PATCH', body: b }).then((r) => r.reminder),
  remove: (id: string) => api<void>(`/reminders/${id}`, { method: 'DELETE' }),
  duplicate: (id: string) => api<{ reminder: Reminder }>(`/reminders/${id}/duplicate`, { method: 'POST' }).then((r) => r.reminder),
  schedule: (id: string, scheduledAt: string) => api<{ reminder: Reminder }>(`/reminders/${id}/schedule`, { method: 'POST', body: { scheduledAt } }),
  cancel: (id: string) => api<{ reminder: Reminder }>(`/reminders/${id}/cancel`, { method: 'POST' }),
  sendNow: (id: string) => api<{ reminder: Reminder }>(`/reminders/${id}/send`, { method: 'POST' }),
  retryFailed: (id: string) => api<{ queued: number }>(`/reminders/${id}/retry`, { method: 'POST' }),
  deliveries: (id: string, signal?: AbortSignal) => api<{ items: DeliveryLog[] }>(`/reminders/${id}/deliveries`, { signal }).then((r) => r.items),
  stats: (signal?: AbortSignal) => api<{ counts: Record<ReminderStatus, number>; next: Reminder[]; recent: Reminder[] }>('/reminders/stats', { signal }),
};

export const templatesApi = {
  list: (signal?: AbortSignal) => api<{ items: Template[] }>('/templates', { signal }).then((r) => r.items),
  save: (t: Partial<Template> & Pick<Template, 'name' | 'content'>) =>
    t.id
      ? api<{ template: Template }>(`/templates/${t.id}`, { method: 'PATCH', body: t })
      : api<{ template: Template }>('/templates', { method: 'POST', body: t }),
  remove: (id: string) => api<void>(`/templates/${id}`, { method: 'DELETE' }),
};

export const recipientsApi = {
  list: (signal?: AbortSignal) => api<{ items: Recipient[] }>('/recipients', { signal }).then((r) => r.items),
  save: (r: Partial<Recipient> & Pick<Recipient, 'name' | 'type' | 'channel'>) =>
    r.id ? api<{ recipient: Recipient }>(`/recipients/${r.id}`, { method: 'PATCH', body: r }) : api<{ recipient: Recipient }>('/recipients', { method: 'POST', body: r }),
  remove: (id: string) => api<void>(`/recipients/${id}`, { method: 'DELETE' }),
};

export interface NewAdmin {
  username: string;
  email: string;
  display_name: string;
  password: string;
  permissions: string[];
}

export const adminsApi = {
  list: (signal?: AbortSignal) => api<{ items: Admin[] }>('/admins', { signal }).then((r) => r.items),
  catalog: (signal?: AbortSignal) => api<{ items: PermissionDef[]; defaults: string[] }>('/permissions', { signal }),
  create: (b: NewAdmin) => api<{ admin: Admin }>('/admins', { method: 'POST', body: b }),
  update: (id: string, b: { display_name?: string; email?: string; status?: 'active' | 'disabled'; permissions?: string[] }) =>
    api<{ admin: Admin }>(`/admins/${id}`, { method: 'PATCH', body: b }),
  resetPassword: (id: string, password: string) => api<void>(`/admins/${id}/reset-password`, { method: 'POST', body: { password } }),
  remove: (id: string) => api<void>(`/admins/${id}`, { method: 'DELETE' }),
  updateMe: (b: { display_name?: string; email?: string }) => api<{ admin: Admin }>('/admins/me', { method: 'PATCH', body: b }),
};

export const logsApi = {
  delivery: (q: Q, signal?: AbortSignal) => list<DeliveryLog>('/delivery-logs', q, signal),
  activity: (q: Q, signal?: AbortSignal) => list<ActivityLog>('/activity', q, signal),
};

export const settingsApi = {
  get: (signal?: AbortSignal) => api<{ settings: AppSettings }>('/settings', { signal }).then((r) => r.settings),
  save: (s: Partial<AppSettings>) => api<{ settings: AppSettings }>('/settings', { method: 'PUT', body: s }).then((r) => r.settings),
};

export const authApi = {
  changePassword: (currentPassword: string, newPassword: string) =>
    api<{ accessToken: string }>('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),
};
