/**
 * Development database server.
 *
 * This sandbox and many dev machines don't have a system PostgreSQL, so we
 * ship a real PostgreSQL server via the `embedded-postgres` npm package
 * (static binaries, no system install). In production you use a managed /
 * self-hosted PostgreSQL and this script is not used (see docs/DEPLOYMENT.md).
 *
 * Commands:
 *   node scripts/dev-db.mjs up      — start (data persists in .data/postgres)
 *   node scripts/dev-db.mjs down    — stop
 *   node scripts/dev-db.mjs status  — show status
 *   node scripts/dev-db.mjs reset   — stop + wipe data directory
 */
import EmbeddedPostgres from 'embedded-postgres';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.PG_DATA_DIR || path.join(ROOT, '.data', 'postgres');
const PORT = Number(process.env.PG_PORT || 5432);
const USER = 'nazareth';
const PASSWORD = 'nazareth';

const cmd = process.argv[2] || 'up';

function makePg() {
  return new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    port: PORT,
    user: USER,
    password: PASSWORD,
    persistent: true,
    onLog: () => {},
    onError: (m) => console.error('[pg]', m),
  });
}

function isAlive() {
  try {
    const pid = Number(readFileSync(path.join(DATA_DIR, 'chms.pid'), 'utf8'));
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

if (cmd === 'status') {
  console.log(isAlive() ? `postgres RUNNING on 127.0.0.1:${PORT}` : 'postgres STOPPED');
  process.exit(0);
}

if (cmd === 'down') {
  try {
    await makePg().stop();
    console.log('postgres stopped');
  } catch (err) {
    console.log('postgres stop attempt:', err.message);
  }
  try { rmSync(path.join(DATA_DIR, 'chms.pid'), { force: true }); } catch {}
  process.exit(0);
}

if (cmd === 'reset') {
  try { await makePg().stop(); } catch {}
  if (existsSync(DATA_DIR)) rmSync(DATA_DIR, { recursive: true, force: true });
  console.log('postgres data wiped');
  process.exit(0);
}

// up ────────────────────────────────────────────────────────────────────────
mkdirSync(DATA_DIR, { recursive: true });
if (isAlive()) {
  console.log(`postgres already RUNNING on 127.0.0.1:${PORT}`);
  process.exit(0);
}

const pg = makePg();
if (!existsSync(path.join(DATA_DIR, 'PG_VERSION'))) {
  console.log('initializing postgres cluster…');
  await pg.initialise();
}
console.log('starting postgres…');
await pg.start();

// Wait until it accepts connections (superuser = initdb user).
const ready = await (async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const c = pg.getPgClient('postgres', '127.0.0.1');
      await c.connect();
      await c.end();
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
})();
if (!ready) {
  console.error('postgres did not become ready in 30s');
  process.exit(1);
}

writeFileSync(path.join(DATA_DIR, 'chms.pid'), String(process.pid));

// Ensure the app databases exist.
for (const db of ['nazareth', 'nazareth_test']) {
  try {
    await pg.createDatabase(db);
    console.log(`created database ${db}`);
  } catch (err) {
    if (!/already exists/i.test(String(err.message))) throw err;
  }
}

console.log(`postgres RUNNING on 127.0.0.1:${PORT} (databases: nazareth, nazareth_test)`);
console.log('Keeping process alive — press Ctrl+C to stop.');

setInterval(() => {}, 60_000);
