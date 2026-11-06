import type { Request } from 'express';
import { logger } from '../../config/logger';
import { Db, pool } from '../../db/pool';

export interface ActivityInput {
  adminId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/** Writes an audit entry. Pass a transaction client as `db` to make the log atomic with the change. */
export async function logActivity(input: ActivityInput, req?: Request, db: Db = pool): Promise<void> {
  try {
    await db.query(
      `INSERT INTO activity_logs (admin_id, action, entity_type, entity_id, metadata, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [
        input.adminId ?? req?.admin?.id ?? null,
        input.action,
        input.entityType ?? null,
        input.entityId ?? null,
        JSON.stringify(input.metadata ?? {}),
        req?.ip ?? null,
        req?.get('user-agent')?.slice(0, 300) ?? null,
      ],
    );
  } catch (err) {
    // When called inside a transaction a failed insert aborts it, so rethrow there; otherwise never break the request.
    if (db !== pool) throw err;
    logger.error({ err, action: input.action }, 'failed to write activity log');
  }
}
