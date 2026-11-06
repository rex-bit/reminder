import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from '../config/env';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: true } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export type Db = Pick<Pool | PoolClient, 'query'>;

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  db: Db = pool,
): Promise<QueryResult<T>> {
  return db.query<T>(text, params as never[]);
}

export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
