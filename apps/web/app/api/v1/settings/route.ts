import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, parseBody } from '@/lib/api';
import { queryOne } from '@nazareth/db';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/** Church settings (settings.manage only). Sensitive fields are masked for non-super-admins. */
export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'settings.manage');
    const org = await queryOne<any>('SELECT * FROM organizations WHERE id = $1', [c.scope.orgId]);
    if (!org) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Organization not found.' } }, { status: 404 });
    const { smtp_password: _sp, sms_password: _sm, ...rest } = org.settings ?? {};
    return NextResponse.json({ data: { ...org, settings: { ...rest, smtp_password: org.settings?.smtp_password ? '••••••••' : '', sms_password: org.settings?.sms_password ? '••••••••' : '' } } });
  })(req);
}

const settingsSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  address: z.string().trim().max(255).optional(),
  city: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().optional(),
  website: z.string().trim().max(200).optional(),
  default_currency: z.string().trim().length(3).optional(),
  timezone: z.string().trim().max(64).optional(),
  default_language: z.string().trim().max(10).optional(),
  settings: z.record(z.unknown()).optional(),
});

export async function PUT(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'settings.manage');
    const body = await parseBody(req, settingsSchema);
    const org = await queryOne<any>('SELECT * FROM organizations WHERE id = $1', [c.scope.orgId]);
    const settings = { ...org.settings, ...(body.settings ?? {}) };
    // Masked passwords are not overwritten
    if (settings.smtp_password === '••••••••') settings.smtp_password = org.settings?.smtp_password ?? '';
    if (settings.sms_password === '••••••••') settings.sms_password = org.settings?.sms_password ?? '';
    await queryOne(
      `UPDATE organizations SET name = COALESCE($2, name), address = COALESCE($3, address), city = COALESCE($4, city),
         country = COALESCE($5, country), phone = COALESCE($6, phone), email = COALESCE($7, email),
         website = COALESCE($8, website), default_currency = COALESCE($9, default_currency),
         timezone = COALESCE($10, timezone), default_language = COALESCE($11, default_language),
         settings = COALESCE($12::jsonb, settings), updated_at = now()
       WHERE id = $1 RETURNING id`,
      [c.scope.orgId, body.name ?? null, body.address ?? null, body.city ?? null, body.country ?? null,
       body.phone ?? null, body.email ?? null, body.website ?? null, body.default_currency ?? null,
       body.timezone ?? null, body.default_language ?? null, JSON.stringify(settings)],
    );
    const { audit } = await import('@nazareth/core');
    await audit({ userId: c.userId, orgId: c.orgId, action: 'settings.update', entity: 'organization', entityId: c.scope.orgId, ip: c.ip });
    return NextResponse.json({ data: { ok: true } });
  })(req);
}
