import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, parseBody } from '@/lib/api';
import { eventService } from '@nazareth/core';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string; regId: string } };

export async function PUT(req: NextRequest, { params }: Params) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const body = await parseBody(req, z.object({ status: z.enum(['registered', 'attended', 'absent', 'cancelled']) }));
    const reg = await eventService.setRegistrationStatus(c.scope, params.id, params.regId, body.status);
    return NextResponse.json({ data: reg });
  })(req);
}
