/** Shapes shared with the backend (see backend/migrations/001_init.sql and docs/API.md). */

export type ReminderStatus = 'draft' | 'pending' | 'due' | 'sent' | 'failed' | 'cancelled';
export type ReminderKind = 'daily' | 'emergency';
export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly';
export type DeliveryChannel = 'whatsapp_cloud' | 'manual_share';
export type DeliveryStatus = 'queued' | 'accepted' | 'sent' | 'delivered' | 'read' | 'failed';
export type JobStatus = 'scheduled' | 'queued' | 'active' | 'completed' | 'failed' | 'cancelled';

export interface Admin {
  id: string;
  admin_code: string;
  username: string;
  email: string;
  display_name: string;
  status: 'active' | 'disabled';
  role_key: 'owner' | 'admin';
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  permissions: string[];
}

export interface PermissionDef {
  key: string;
  category: string;
  description: string;
}

export interface SubjectItem {
  time?: string;
  subject: string;
  teacher?: string;
}
export interface HomeworkItem {
  subject: string;
  task: string;
  due?: string;
}
export interface PiketItem {
  name: string;
  area?: string;
}

export interface ReminderContent {
  uniform: string;
  subjects: SubjectItem[];
  homework: HomeworkItem[];
  piket: PiketItem[];
  notes: string;
  announcements: string;
}

export interface Reminder {
  id: string;
  title: string;
  kind: ReminderKind;
  status: ReminderStatus;
  reminder_date: string; // YYYY-MM-DD
  content: ReminderContent;
  custom_message: string | null;
  template_id: string | null;
  timezone: string;
  scheduled_at: string | null;
  recurrence: Recurrence;
  recurrence_until: string | null;
  sent_at: string | null;
  recipient_ids: string[];
  /** Manual-share recipients of this occurrence; `done` once an admin marked it as sent. */
  manual_shares: { recipient_id: string; name: string; done: boolean }[];
  created_at: string;
  updated_at: string;
}

export interface ReminderInput {
  title: string;
  kind: ReminderKind;
  reminder_date: string;
  content: ReminderContent;
  custom_message: string | null;
  template_id: string | null;
  timezone: string;
  recurrence: Recurrence;
  recurrence_until: string | null;
  recipient_ids: string[];
}

export interface Template {
  id: string;
  name: string;
  description: string;
  content: ReminderContent;
  message_body: string | null;
  created_at: string;
  updated_at: string;
}

export interface Recipient {
  id: string;
  name: string;
  type: 'individual' | 'group';
  channel: DeliveryChannel;
  phone_e164: string | null;
  wa_group_id: string | null;
  is_active: boolean;
  notes: string;
}

export interface DeliveryLog {
  id: string;
  reminder_id: string;
  reminder_title: string | null;
  recipient_id: string | null;
  recipient_name: string | null;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  wa_message_id: string | null;
  attempt: number;
  error_code: string | null;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
  admin_id: string | null;
  admin_code: string | null;
  admin_name: string | null;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AppSettings {
  'app.timezone': string;
  'app.name': string;
  'whatsapp.groups_supported': boolean;
  'public.enabled': boolean;
  'reminder.default_send_time': string;
}

export const EMPTY_CONTENT: ReminderContent = {
  uniform: '',
  subjects: [],
  homework: [],
  piket: [],
  notes: '',
  announcements: '',
};

/** Read-only reminder as shown on the public class page (no recipients or delivery data). */
export type PublicReminder = Pick<Reminder, 'id' | 'title' | 'kind' | 'status' | 'reminder_date' | 'content' | 'custom_message' | 'scheduled_at' | 'sent_at' | 'timezone'>;
export interface PublicFeed {
  timezone: string;
  today: string;
  pinned: PublicReminder[];
  upcoming: PublicReminder[];
  recent: PublicReminder[];
}
