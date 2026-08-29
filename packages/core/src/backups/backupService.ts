/**
 * @nazareth/core — automated database backups.
 *
 * Runs pg_dump (found next to the embedded-postgres binaries or on PATH)
 * nightly, keeps N most recent dumps (BACKUP_RETENTION), and logs every run
 * in backup_logs (status, size, path). Restore procedure: docs/BACKUP.md.
 */
import { execFile } from 'node:child_process';
import { readdir, stat, unlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { query, queryValue } from '@nazareth/db';
import { config } from '../config';
import { audit } from '../audit/auditService';

const pExecFile = promisify(execFile);

function findPgDump(): string {
  const candidates = [
    process.env.PG_DUMP_BIN,
    'pg_dump',
    // embedded-postgres ships pg_dump in its platform package
    path.join(process.cwd(), 'node_modules', '@embedded-postgres', 'linux-x64', 'bin', 'pg_dump'),
    path.join(process.cwd(), 'node_modules', 'embedded-postgres', 'node_modules', '@embedded-postgres', 'linux-x64', 'bin', 'pg_dump'),
  ].filter(Boolean);
  // First try PATH; otherwise the embedded location.
  return candidates[candidates.length - 1] === 'pg_dump' ? 'pg_dump' : candidates.find(Boolean) || 'pg_dump';
}

export async function runBackup(trigger: 'scheduled' | 'manual', userId?: string): Promise<{ file: string; sizeBytes: number }> {
  const outDir = path.resolve(config.backupPath);
  await mkdir(outDir, { recursive: true });
  const url = new URL(process.env.DATABASE_URL || '');
  const file = path.join(outDir, `nazareth_${new Date().toISOString().replace(/[:.]/g, '-')}.sql.gz`);
  const logRow = (await queryValue<string>(
    "INSERT INTO backup_logs (kind, status, started_at) VALUES ('database','running') RETURNING id::text",
  ))!;
  try {
    const { stdout } = await pExecFile(
      findPgDump(),
      [`--host=${url.hostname || 'localhost'} --port=${url.port || '5432'} --username=${decodeURIComponent(url.username || 'nazareth')}
        --dbname=${url.pathname.replace(/^\//, '')} --format=plain --compress=6 --file=${file} --no-owner --no-privileges`],
      { env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password || '') }, timeout: 300_000 },
    );
    const s = await stat(file);
    await query('UPDATE backup_logs SET status = \'success\', file_path = $2, size_bytes = $3, completed_at = now(), note = $4 WHERE id = $1::uuid',
      [logRow, file, s.size, `trigger=${trigger}`]);
    if (userId) await audit({ userId, action: 'backup.run', entity: 'backup', entityId: logRow, metadata: { trigger, file: path.basename(file), size: s.size } });
    return { file, sizeBytes: s.size };
  } catch (err: any) {
    await query("UPDATE backup_logs SET status = 'failed', completed_at = now(), note = $2 WHERE id = $1::uuid",
      [logRow, String(err.message ?? err).slice(0, 500)]);
    throw new Error(`Backup failed: ${err.message}`);
  }
}

export async function pruneBackups(): Promise<number> {
  const outDir = path.resolve(config.backupPath);
  const files = (await readdir(outDir).catch(() => [] as string[])).filter((f) => f.endsWith('.sql.gz')).sort();
  const excess = files.length - config.backupRetention;
  for (let i = 0; i < excess; i++) {
    await unlink(path.join(outDir, files[i])).catch(() => {});
  }
  return Math.max(0, excess);
}

export async function listBackups() {
  return query<any>(
    `SELECT id, kind, status, file_path, size_bytes, note, started_at, completed_at
       FROM backup_logs ORDER BY started_at DESC LIMIT 50`,
  );
}
