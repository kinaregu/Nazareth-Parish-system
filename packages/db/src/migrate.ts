/**
 * @nazareth/db — migration runner.
 *
 * Applies packages/db/migrations/*.sql in lexical order, tracking applied
 * versions in the schema_migrations table. Each migration runs in a
 * transaction (single-statement DDL that supports it; this codebase keeps
 * every migration transaction-safe).
 *
 * Usage:
 *   npm run db:migrate         (DATABASE_URL)
 *   npm run db:migrate:test    (DATABASE_URL_TEST)
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { loadEnv } from './env';

loadEnv();

const isTest = process.argv.includes('--db') && process.argv[process.argv.indexOf('--db') + 1] === 'test';
const url = isTest ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;
if (!url) {
  console.error(isTest ? 'DATABASE_URL_TEST is not set.' : 'DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const dir = path.join(__dirname, '..', 'migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  const applied = new Set<string>(
    (await pool.query('SELECT version FROM schema_migrations')).rows.map((r: any) => r.version as string),
  );

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
      await client.query('COMMIT');
      console.log(`✔ applied ${file}`);
      count++;
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error(`✘ failed ${file}:`, err.message);
      process.exitCode = 1;
      return;
    } finally {
      client.release();
    }
  }
  if (count === 0) console.log('Schema already up to date.');
  else console.log(`${count} migration(s) applied.`);
}

main()
  .catch((err) => {
    console.error('Migration run failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
