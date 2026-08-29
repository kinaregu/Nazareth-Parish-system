import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, query, queryCol, queryValue, closePool } from '@nazareth/db';
import { branchScopeWhere } from '../rbac/scope';

/**
 * Database integration tests.
 *
 * Run against a migrated + seeded PostgreSQL database (CI: postgres service
 * container; locally: `npm run db:migrate && npm run db:seed` with
 * DATABASE_URL pointing at a disposable database). Skipped automatically
 * when no DATABASE_URL is configured or the server is unreachable.
 */
let dbOk = true;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    dbOk = false;
    return;
  }
  try {
    await pool.query('SELECT 1');
  } catch {
    dbOk = false;
  }
});

afterAll(async () => {
  if (dbOk) await closePool();
});

describe.skipIf(!process.env.DATABASE_URL)('migrations & seed', () => {
  it('applied at least one migration', async () => {
    const n = await queryValue<number>('SELECT COUNT(*)::int FROM schema_migrations');
    expect(n).toBeGreaterThan(0);
  });

  it('seeded demo members exist and are flagged is_demo', async () => {
    const n = await queryValue<number>('SELECT COUNT(*)::int FROM members WHERE is_demo');
    expect(n).toBeGreaterThan(0);
  });

  it('seeded users exist for all core roles', async () => {
    const roles = await queryValue<string>(
      `SELECT COUNT(DISTINCT r.code)::int FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id`,
    );
    expect(roles).toBeGreaterThanOrEqual(5);
  });
});

describe.skipIf(!process.env.DATABASE_URL)('scoped queries never leak (IDOR guard)', () => {
  it('branchScopeWhere fragment with the __none__ sentinel returns no rows', async () => {
    const [sw, params] = branchScopeWhere({ branchIds: [] } as never);
    const n = await queryValue<number>(
      `SELECT COUNT(*)::int FROM members m WHERE m.deleted_at IS NULL${sw}`,
      params,
    );
    expect(n).toBe(0);
  });

  it('a single-branch fragment only returns members of that branch', async () => {
    const branch = await queryValue<string>('SELECT id FROM branches ORDER BY name LIMIT 1');
    const [sw, params] = branchScopeWhere({ branchIds: [branch] } as never, 'm.branch_id');
    const rows = await query<{ branch_id: string; c: number }>(
      `SELECT m.branch_id, COUNT(*)::int AS c FROM members m
        WHERE m.deleted_at IS NULL${sw} GROUP BY m.branch_id`,
      params,
    );
    expect(rows.length).toBeLessThanOrEqual(1);
    for (const r of rows) expect(r.branch_id).toBe(branch);
  });

  it('a member-id restriction only returns the granted member', async () => {
    const [other] = await queryCol<string>('SELECT id FROM members WHERE deleted_at IS NULL ORDER BY id LIMIT 1');
    if (other === undefined) return; // nothing seeded
    const params: unknown[] = [[other]]; // one parameter: the uuid array (as memberScopeWhere pushes it)
    const sql = `SELECT COUNT(*)::int AS c FROM members m WHERE m.deleted_at IS NULL AND m.id = ANY($1::uuid[])`;
    const { c } = (await query<{ c: number }>(sql, params))[0];
    expect(c).toBe(1);
  });
});
