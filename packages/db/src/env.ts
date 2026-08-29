/**
 * Minimal .env loader (no dependency) for CLI scripts (migrate/seed).
 * The web server loads .env via `next`'s built-in env handling + --env-file.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export function loadEnv(file = '.env'): void {
  const here = process.cwd();
  const candidates = [path.join(here, file), path.join(here, '..', '..', file), path.join(here, '..', file)];
  for (const p of candidates) {
    if (existsSync(p)) {
      const text = readFileSync(p, 'utf8');
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        } else {
          // Strip inline comments (a '#' preceded by whitespace).
          const hash = val.search(/\s#/);
          if (hash !== -1) val = val.slice(0, hash).trim();
        }
        if (process.env[key] === undefined) process.env[key] = val;
      }
      return;
    }
  }
}
