import { generateTotpSecret, otpauthUri, qrDataUrl } from './totp';

/** Prepare a 2FA enrollment payload (QR + otpauth URI). */
export async function totpSetupUri(account: string, issuer: string): Promise<{ secret: string; uri: string; qr: string }> {
  const secret = generateTotpSecret();
  const uri = otpauthUri(secret, account, issuer);
  const qr = await qrDataUrl(uri, 260);
  return { secret, uri, qr };
}
