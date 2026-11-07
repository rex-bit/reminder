import 'dotenv/config';
import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const empty = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4100),
  LOG_LEVEL: z.string().default('info'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  BOT_API_KEY: z.string().min(32, 'BOT_API_KEY must be at least 32 characters'),
  BACKEND_URL: z.string().url(),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1),
  WHATSAPP_PHONE_NUMBER_ID: z.string().regex(/^\d+$/, 'digits only'),
  WHATSAPP_APP_SECRET: z.string().min(1),
  WHATSAPP_VERIFY_TOKEN: z.string().min(8),
  GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default('v21.0'),
  WHATSAPP_TEMPLATE_NAME: z.preprocess(empty, z.string().optional()),
  WHATSAPP_TEMPLATE_LANG: z.string().default('id'),
  WHATSAPP_GROUPS_ENABLED: bool.default('false'),
  REDIS_URL: z.preprocess(empty, z.string().optional()),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(`Invalid bot configuration:\n${parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  process.exit(1);
}
export const config = parsed.data;
