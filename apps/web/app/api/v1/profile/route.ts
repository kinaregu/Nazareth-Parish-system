import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requireAuth, parseBody } from '@/lib/api';
import { queryOne } from '@nazareth/db';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/**
 * Own profile (admin or portal).
 * GET → user + linked member (if any).
 * PUT → name, phone, avatar file id.
 */
export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requireAuth(ctx);
    const member = c.user.member_id
      ? await queryOne<any>(
          `SELECT m.id, m.member_no, m.first_name, m.middle_name, m.last_name, m.gender, m.date_of_birth,
                  m.phone, m.email, m.address, m.city, m.country, m.status, m.date_joined,
                  (SELECT f.name FROM families f
                     JOIN family_members fm ON fm.family_id = f.id
                    WHERE fm.member_id = m.id AND f.deleted_at IS NULL LIMIT 1) AS family_name
             FROM members m
            WHERE m.id = $1 AND m.deleted_at IS NULL`,
          [c.user.member_id],
        )
      : null;
    return NextResponse.json({
      data: {
        user: {
          id: c.user.id, name: c.user.name, email: c.user.email, phone: c.user.phone,
          avatar_file_id: c.user.avatar_file_id, member_id: c.user.member_id,
          email_verified_at: c.user.email_verified_at, totp_enabled: c.user.totp_enabled,
          last_login_at: (c.user as any).last_login_at ?? null,
        },
        member,
      },
    });
  })(req);
}

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  avatar_file_id: z.string().uuid().nullable().optional(),
});

export async function PUT(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requireAuth(ctx);
    const body = await parseBody(req, updateSchema);
    await queryOne(
      `UPDATE users SET name = COALESCE($2, name), phone = COALESCE($3, phone),
        avatar_file_id = $4, updated_at = now()
       WHERE id = $1 RETURNING id`,
      [c.user.id, body.name ?? null, body.phone || null, body.avatar_file_id !== undefined ? body.avatar_file_id : c.user.avatar_file_id],
    );
    return NextResponse.json({ data: { ok: true } });
  })(req);
}
