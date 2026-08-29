import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requirePerm, parseBody } from '@/lib/api';
import { importService } from '@nazareth/core';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const confirmSchema = z.object({
  branch_id: z.string().uuid(),
  rows: z.array(z.object({
    first_name: z.string().trim().min(1),
    middle_name: z.string().optional().or(z.literal('')),
    last_name: z.string().trim().min(1),
    gender: z.string().optional().or(z.literal('')),
    date_of_birth: z.string().optional().or(z.literal('')),
    phone: z.string().optional().or(z.literal('')),
    email: z.string().optional().or(z.literal('')),
    address: z.string().optional().or(z.literal('')),
    city: z.string().optional().or(z.literal('')),
    status: z.string().optional().or(z.literal('')),
    date_joined: z.string().optional().or(z.literal('')),
  })).max(5000),
});

export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requirePerm(ctx, 'members.import');
    const body = await parseBody(req, confirmSchema);
    const report = await importService.confirmImport(c.scope, { branchId: body.branch_id, rows: body.rows }, c.ip);
    return NextResponse.json({ data: report });
  })(req);
}
