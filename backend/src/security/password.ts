import bcrypt from 'bcryptjs';
import { z } from 'zod';

const COST = 12;

// bcrypt only reads the first 72 bytes, so longer passwords are rejected instead of silently truncated.
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, 'Password must be at most 72 bytes')
  .refine((p) => /[a-z]/.test(p) && /[A-Z]/.test(p) && /[0-9]/.test(p), 'Password needs upper case, lower case and a digit');

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Used to keep login timing similar when the account does not exist.
export const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing-only', COST);
