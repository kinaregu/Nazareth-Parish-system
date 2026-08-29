import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx, requireAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withCtx(async (req, ctx) => {
    const c = requireAuth(ctx);
    return NextResponse.json({
      data: {
        user: {
          id: c.user.id,
          name: c.user.name,
          email: c.user.email,
          phone: c.user.phone,
          avatar_file_id: c.user.avatar_file_id,
          member_id: c.user.member_id,
          must_change_password: c.user.must_change_password,
          totp_enabled: c.user.totp_enabled,
          email_verified_at: c.user.email_verified_at,
          branch_id: c.user.branch_id,
        },
        scope: {
          roleCodes: c.scope.roleCodes,
          permissions: [...c.scope.permissions],
          isSuper: c.scope.isSuper,
          branchIds: c.scope.branchIds,
          branchId: c.scope.branchId,
          ministryIds: c.scope.ministryIds,
          groupIds: c.scope.groupIds,
          linkedMemberId: c.scope.linkedMemberId,
          orgId: c.scope.orgId,
        },
      },
    });
  })(req);
}
