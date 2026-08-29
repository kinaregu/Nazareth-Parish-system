import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, parseBody } from '@/lib/api';
import { notify } from '@nazareth/core';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    requirePerm(ctx, 'templates.manage');
    const c = ctx as any;
    const data = await notify.listTemplates(c.scope.orgId);
    return NextResponse.json({ data });
  })(req);
}

const templateSchema = z.object({
  code: z.string().trim().min(2).max(60).regex(/^[a-z0-9_]+$/),
  name: z.string().trim().min(1).max(120),
  channel: z.enum(['email', 'sms', 'in_app']),
  subject: z.string().trim().max(200).default(''),
  body: z.string().trim().min(1).max(5000),
  is_active: z.boolean().default(true),
});

export async function PUT(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'templates.manage');
    const body = await parseBody(req, templateSchema);
    const data = await notify.upsertTemplate(c.scope.orgId, body as any, c.userId);
    return NextResponse.json({ data });
  })(req);
}
