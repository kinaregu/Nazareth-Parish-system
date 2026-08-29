/**
 * @nazareth/core — password hashing (Node built-in scrypt, no native deps).
 *
 * Format: s2$N$r$p$<salt hex>$<hash hex>
 * Comparison uses timingSafeEqual to avoid timing attacks.
 * scrypt is a memory-hard KDF (same family as Argon2's PBKDF alternative) and
 * is the recommended built-in for Node services without native extensions.
 */
import { randomBytes, scrypt as _scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    _scrypt(password, salt, keylen, options, (err, derivedKey) => (err ? reject(err) : resolve(derivedKey)));
  });
}

const N = 16384; // CPU/memory cost
const R = 8;
const P = 1;
const KEYLEN = 64;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const buf = (await scrypt(plain, salt, KEYLEN, { N, r: R, p: P })) as Buffer;
  return `s2$${N}$${R}$${P}$${salt.toString('hex')}$${buf.toString('hex')}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 's2') return false;
    const Nv = Number(parts[1]);
    const Rv = Number(parts[2]);
    const Pv = Number(parts[3]);
    const salt = Buffer.from(parts[4], 'hex');
    const expected = Buffer.from(parts[5], 'hex');
    const buf = (await scrypt(plain, salt, expected.length, { N: Nv, r: Rv, p: Pv })) as Buffer;
    return timingSafeEqual(buf, expected);
  } catch {
    return false;
  }
}

export function randomPassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const bytes = randomBytes(length);
  let out = upper[bytes[0] % upper.length] + lower[bytes[1] % lower.length] + digits[bytes[2] % digits.length];
  for (let i = 3; i < length; i++) out += all[bytes[i] % all.length];
  return out;
}
