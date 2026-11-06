import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AccessClaims {
  sub: string; // admin id
  tv: number; // token version
}

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    issuer: 'reminder-api',
  });
}

export function verifyAccessToken(token: string): AccessClaims | null {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: 'reminder-api' });
    if (typeof payload === 'string') return null;
    if (typeof payload.sub !== 'string' || typeof payload.tv !== 'number') return null;
    return { sub: payload.sub, tv: payload.tv };
  } catch {
    return null;
  }
}

export function newRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Constant-time string comparison (for API keys). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
