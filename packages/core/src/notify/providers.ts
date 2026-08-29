/**
 * @nazareth/core — communication channel providers.
 *
 * Provider abstraction (ADR-006): the domain never talks to a specific
 * email/SMS vendor. `MailProvider` / `SmsProvider` are interfaces; the dev
 * implementation writes to the `dev_outbox` table (visible under
 * Administration → Dev Outbox in development) so email/SMS flows can be
 * exercised end-to-end without external services. Swap in SMTP (nodemailer),
 * Twilio/RouteMobile etc. via env config in production.
 */
import { query } from '@nazareth/db';
import { config } from '../config';

export interface MailMessage {
  to: string;
  subject: string;
  body: string;
  html?: string;
}
export interface SmsMessage {
  to: string;
  body: string;
}

export interface MailProvider {
  send(msg: MailMessage): Promise<void>;
}
export interface SmsProvider {
  send(msg: SmsMessage): Promise<void>;
}

class DevMailProvider implements MailProvider {
  async send(msg: MailMessage): Promise<void> {
    console.log(`[mail:dev] to=${msg.to} subject="${msg.subject}"`);
    await query('INSERT INTO dev_outbox (channel, to_address, subject, body) VALUES ($1,$2,$3,$4)', [
      'email', msg.to, msg.subject, msg.body,
    ]).catch((e) => console.error('[mail:dev] outbox write failed', e));
  }
}

class LogSmsProvider implements SmsProvider {
  async send(msg: SmsMessage): Promise<void> {
    console.log(`[sms:dev] to=${msg.to} body="${msg.body.slice(0, 120)}"`);
    await query('INSERT INTO dev_outbox (channel, to_address, subject, body) VALUES ($1,$2,$3,$4)', [
      'sms', msg.to, null, msg.body,
    ]).catch((e) => console.error('[sms:dev] outbox write failed', e));
  }
}

let mailProvider: MailProvider = new DevMailProvider();
let smsProvider: SmsProvider = new LogSmsProvider();

/**
 * In production, wire real providers here based on integration_configs /
 * env (e.g. SMTP credentials, Twilio SID). The rest of the codebase is
 * unchanged — this is the only integration point.
 */
export function configureProviders(opts?: { mail?: MailProvider; sms?: SmsProvider }): void {
  if (opts?.mail) mailProvider = opts.mail;
  if (opts?.sms) smsProvider = opts.sms;
}

export function sendMail(msg: MailMessage): Promise<void> {
  return mailProvider.send(msg);
}
export function sendSms(msg: SmsMessage): Promise<void> {
  return smsProvider.send(msg);
}

export function getDevOutbox(limit = 50): Promise<any[]> {
  return query(
    `SELECT id, channel, to_address, subject, body, created_at FROM dev_outbox ORDER BY id DESC LIMIT ${Math.min(limit, 200)}`,
  );
}
