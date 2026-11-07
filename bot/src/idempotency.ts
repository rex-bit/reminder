import IORedis from 'ioredis';
import { config } from './config';

/**
 * Prevents sending the same message twice when the backend retries after a lost response.
 * claim() -> 'new' (you may send) | 'pending' (another request is sending) | {messageId} (already sent).
 */
export type Claim = 'new' | 'pending' | { messageId: string };

export interface Store {
  claim(key: string): Promise<Claim>;
  complete(key: string, messageId: string): Promise<void>;
  release(key: string): Promise<void>;
}

const PENDING_TTL_S = 120;
const DONE_TTL_S = 7 * 86_400;

class RedisStore implements Store {
  private r = new IORedis(config.REDIS_URL!, { maxRetriesPerRequest: 2 });
  async claim(key: string): Promise<Claim> {
    const k = `bot:idem:${key}`;
    if ((await this.r.set(k, 'pending', 'EX', PENDING_TTL_S, 'NX')) === 'OK') return 'new';
    const v = await this.r.get(k);
    return v && v !== 'pending' ? { messageId: v } : 'pending';
  }
  async complete(key: string, messageId: string) { await this.r.set(`bot:idem:${key}`, messageId, 'EX', DONE_TTL_S); }
  async release(key: string) { await this.r.del(`bot:idem:${key}`); }
}

class MemoryStore implements Store {
  private m = new Map<string, { v: string; exp: number }>();
  private get(key: string) {
    const e = this.m.get(key);
    if (e && e.exp < Date.now()) this.m.delete(key);
    return this.m.get(key);
  }
  async claim(key: string): Promise<Claim> {
    const e = this.get(key);
    if (!e) { this.m.set(key, { v: 'pending', exp: Date.now() + PENDING_TTL_S * 1000 }); return 'new'; }
    return e.v === 'pending' ? 'pending' : { messageId: e.v };
  }
  async complete(key: string, messageId: string) { this.m.set(key, { v: messageId, exp: Date.now() + DONE_TTL_S * 1000 }); }
  async release(key: string) { this.m.delete(key); }
}

export const idempotency: Store = config.REDIS_URL ? new RedisStore() : new MemoryStore();
export { MemoryStore };
