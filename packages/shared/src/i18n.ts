/**
 * @nazareth/shared — internationalization scaffolding.
 *
 * The app is built for i18n: UI strings are resolved through t() and grouped
 * by namespace in messages/en.json. Adding a language = add messages/<lng>.json
 * and ship it; components never hard-code translated strings inline.
 */

import en from './messages/en.json';

export type MessageKey = string;

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', default: true },
] as const;

type Messages = Record<string, Record<string, unknown>>;

export function t(key: string, vars?: Record<string, string | number>): string {
  const parts = key.split('.');
  let node: unknown = en;
  for (const p of parts) {
    if (node && typeof node === 'object' && p in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[p];
    } else {
      return key; // fall back to key
    }
  }
  if (typeof node !== 'string') return key;
  if (!vars) return node;
  return node.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}

export const messages = en as unknown as Messages;
