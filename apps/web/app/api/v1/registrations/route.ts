import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, parseBody, getAnonCtx } from '@/lib/api';
import { registrationService } from '@nazareth/core';
import { queryOne } from '@nazareth/db';
import { z } from 'zod';
import { ratelimit } from '@nazareth/core';

export const dynamic = 'force-dynamic';

const publicRegistrationSchema = z.object({
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  middle_name: z.string().trim().max(80).optional().or(z.literal('')),
  gender: z.enum(['male', 'female', 'other']).optional(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  email: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  address: z.string().trim().max(255).optional().or(z.literal('')),
  city: z.string().trim().max(80).optional().or(z.literal('')),
  country: z.string().trim().max(80).optional().or(z.literal('')),
  family_name: z.string().trim().max(120).optional().or(z.literal('')),
  family_info: z.record(z.unknown()).optional(),
  interests: z.array(z.string().trim().max(60)).max(20).optional(),
  previous_church: z.string().trim().max(160).optional().or(z.literal('')),
  heard_from: z.string().trim().max(60).optional().or(z.literal('')),
  message: z.string().trim().max(4000).optional().or(z.literal('')),
});

/** Public self-registration (no auth required, rate-limited per IP). */
export async function POST(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const body = await parseBody(req, publicRegistrationSchema);
    const anon = ctx as { ip: string };
    const rl = ratelimit.rateLimit(`register:${anon.ip}`, { max: 5, windowMs: 60 * 60_000 });
    if (!rl.ok) return NextResponse.json({ error: { code: 'RATE_LIMITED', message: 'Too many registrations from this connection. Try again later.' } }, { status: 429 });
    const org = await queryOne<any>('SELECT id FROM organizations LIMIT 1');
    if (!org) return NextResponse.json({ error: { code: 'INTERNAL', message: 'Church not configured.' } }, { status: 500 });
    const res = await registrationService.createRegistration(body, org.id);
    return NextResponse.json({ data: res }, { status: 201 });
  })(req);
}
