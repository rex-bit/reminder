import 'dotenv/config';
import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z.string().default('info'),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),

    DATABASE_URL: z.string().min(1),
    DATABASE_SSL: bool.default('false'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(14),

    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)),
    COOKIE_SECURE: bool.default('false'),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    COOKIE_DOMAIN: z.preprocess(emptyToUndefined, z.string().optional()),

    DEFAULT_TIMEZONE: z.string().default('Asia/Jakarta'),

    OWNER_USERNAME: z.preprocess(emptyToUndefined, z.string().optional()),
    OWNER_EMAIL: z.preprocess(emptyToUndefined, z.string().email().optional()),
    OWNER_PASSWORD: z.preprocess(emptyToUndefined, z.string().min(12).max(72).optional()),

    BOT_API_KEY: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
  })
  .superRefine((v, ctx) => {
    if (v.COOKIE_SAMESITE === 'none' && !v.COOKIE_SECURE) {
      ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'COOKIE_SAMESITE=none requires COOKIE_SECURE=true' });
    }
    if (v.NODE_ENV === 'production' && !v.COOKIE_SECURE) {
      ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'COOKIE_SECURE must be true in production' });
    }
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: v.DEFAULT_TIMEZONE });
    } catch {
      ctx.addIssue({ code: 'custom', path: ['DEFAULT_TIMEZONE'], message: 'Invalid IANA timezone' });
    }
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${lines.join('\n')}`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
