/**
 * @nazareth/db — PostgreSQL data layer.
 *
 * - Pooled `pg` connection (single shared pool per process, created lazily
 *   so environment loading can happen first)
 * - `query` / `queryOne` / `queryValue` helpers
 * - `tx` — run a callback inside a transaction
 */
import pg from 'pg';

const { Pool } = pg;

let _pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_SIZE || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    _pool.on('error', (err) => {
      // Surface pool-level errors (e.g. server restart) without crashing.
      console.error('[db] pool error:', err.message);
    });
  }
  return _pool;
}

/**
 * Lazy proxy so `pool.query(...)` keeps working from importing code while
 * the actual Pool (and its env) is resolved on first use.
 */
export const pool: pg.Pool = new Proxy({} as pg.Pool, {
  get(_target, prop) {
    return (getPool() as unknown as Record<PropertyKey, unknown>)[prop];
  },
});

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PageResult<T> {
  data: T[];
  meta: PageMeta;
}

export async function query<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await getPool().query(text, params);
  return res.rows as T[];
}

/**
 * Query a single-column SELECT and return the column values.
 * Use for `SELECT id FROM …` style lookups (rows are objects, not scalars).
 */
export async function queryCol<T = string>(text: string, params: unknown[] = []): Promise<T[]> {
  const rows = await query<Record<string, T>>(text, params);
  return rows.map((r) => Object.values(r)[0] as T);
}

export async function queryOne<T = any>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Returns a single scalar value (first column of first row), or null. */
export async function queryValue<T = any>(text: string, params: unknown[] = []): Promise<T | null> {
  const res = await getPool().query(text, params);
  const row = res.rows[0];
  if (!row) return null;
  return row[Object.keys(row)[0]] as T;
}

export interface Tx {
  client: pg.PoolClient;
  query<T = any>(text: string, params?: unknown[]): Promise<T[]>;
  one<T = any>(text: string, params?: unknown[]): Promise<T | null>;
}

/** Run fn inside a transaction. Commits on success, rolls back on error. */
export async function tx<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const t: Tx = {
      client,
      query: async <R = any>(text: string, params: unknown[] = []): Promise<R[]> => (await client.query(text, params)).rows as R[],
      one: async <R = any>(text: string, params: unknown[] = []): Promise<R | null> => (await client.query(text, params)).rows[0] ?? null,
    };
    const result = await fn(t);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (_pool) await _pool.end();
  _pool = null;
}

export type { PoolClient } from 'pg';
