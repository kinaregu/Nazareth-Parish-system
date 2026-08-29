import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, parseBody } from '@/lib/api';
import { registrationService } from '@nazareth/core';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const reviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(500).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'registrations.review');
    const body = await parseBody(req, reviewSchema);
    const result = await registrationService.reviewRegistration(c.scope, params.id, body.decision, body.note, c.ip);
    return NextResponse.json({ data: result }, { status: 200 });
  })(req);
}
