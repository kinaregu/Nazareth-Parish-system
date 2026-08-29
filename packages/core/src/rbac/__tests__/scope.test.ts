import { describe, expect, it } from 'vitest';
import {
  branchScopeWhere,
  groupScopeWhere,
  ministryScopeWhere,
  hasPermission,
  type AccessScope,
} from '../scope';

const B1 = '11111111-1111-4111-8111-111111111111';
const B2 = '22222222-2222-4222-8222-222222222222';
const G1 = '33333333-3333-4333-8333-333333333333';

function mkScope(over: Partial<AccessScope> = {}): AccessScope {
  return {
    userId: '00000000-0000-0000-0000-000000000000',
    orgId: '00000000-0000-0000-0000-000000000001',
    branchId: null,
    branchIds: null,
    roleCodes: [],
    permissions: new Set<string>(),
    ministryIds: [],
    groupIds: [],
    isSuper: false,
    memberIds: null,
    linkedMemberId: null,
    ...over,
  };
}

describe('branchScopeWhere', () => {
  it('returns an empty fragment for unrestricted (org-wide) users', () => {
    expect(branchScopeWhere(mkScope())).toEqual(['', []]);
  });

  it('emits an ANY fragment with the branch array as $1', () => {
    const [sql, params] = branchScopeWhere(mkScope({ branchIds: [B1, B2] }));
    expect(sql).toBe(' AND branch_id = ANY($1::uuid[])');
    expect(params).toEqual([[B1, B2]]); // one parameter: the uuid array
  });

  it('supports qualified column names for joined queries', () => {
    const [sql] = branchScopeWhere(mkScope({ branchIds: [B1] }), 'e.branch_id');
    expect(sql).toBe(' AND e.branch_id = ANY($1::uuid[])');
  });

  it('uses the __none__ sentinel for an empty branch list so nothing matches', () => {
    const [sql, params] = branchScopeWhere(mkScope({ branchIds: [] }));
    expect(sql).toContain('ANY($1::uuid[])');
    expect(params).toEqual([['00000000-0000-4000-8000-000000000000']]); // nil-uuid sentinel: valid uuid, matches nothing
  });
});

describe('groupScopeWhere', () => {
  it('unrestricted → empty fragment', () => {
    expect(groupScopeWhere(mkScope())).toEqual(['', []]);
  });

  it('branch-scoped non-leader → branch restriction only', () => {
    const [sql, params] = groupScopeWhere(mkScope({ branchIds: [B1] }));
    expect(sql).toBe(' AND branch_id = ANY($1::uuid[])');
    expect(params).toEqual([[B1]]);
  });

  it('group leader → group ids AND branch ids, qualified columns', () => {
    const [sql, params] = groupScopeWhere(
      mkScope({
        roleCodes: ['group_leader'],
        groupIds: [G1],
        branchIds: [B1, B2],
        memberIds: [],
      }),
      'g.branch_id',
      'g.id',
    );
    expect(sql).toBe(' AND g.id = ANY($1::uuid[])');
    expect(params).toEqual([[G1]]);
  });
});

describe('ministryScopeWhere', () => {
  it('ministry leader gets ministry-id + branch fragments with qualified columns', () => {
    const [sql, params] = ministryScopeWhere(
      mkScope({ roleCodes: ['ministry_leader'], ministryIds: [G1], branchIds: [B1] }),
      'm.branch_id',
      'm.id',
    );
    expect(sql).toBe(' AND m.id = ANY($1::uuid[]) AND m.branch_id = ANY($2::uuid[])');
    expect(params).toEqual([[G1], [B1]]);
  });

  it('branch-scoped non-leader falls back to branch restriction', () => {
    const [sql] = ministryScopeWhere(mkScope({ branchIds: [B1] }), 'm.branch_id', 'm.id');
    expect(sql).toBe(' AND m.branch_id = ANY($1::uuid[])');
  });
});

describe('hasPermission', () => {
  it('super users pass any permission', () => {
    expect(hasPermission(mkScope({ isSuper: true }), 'anything.at.all')).toBe(true);
  });

  it('exact permission match', () => {
    const s = mkScope({ permissions: new Set(['members.view', 'members.create']) });
    expect(hasPermission(s, 'members.view')).toBe(true);
    expect(hasPermission(s, 'members.delete')).toBe(false);
  });

  it('wildcard permission', () => {
    expect(hasPermission(mkScope({ permissions: new Set(['*']) }), 'x.y')).toBe(true);
  });
});

describe('parameter index shifting (getX id-collision guard)', () => {
  it('shifts fragment indices by one when a query has its own leading parameter', () => {
    // This is the exact pattern every getX() service function uses:
    // params are [id, ...scopeParams] while the fragment was written for
    // scopeParams-first ordering, so $N in the fragment must become $N+1.
    const [sw0, sp] = branchScopeWhere(mkScope({ branchIds: [B1, B2] }));
    const sw = sw0.replace(/\$(\d+)/g, (_, i) => `$${Number(i) + 1}`);
    expect(sw).toBe(' AND branch_id = ANY($2::uuid[])');
    expect(sp).toEqual([[B1, B2]]);
  });

  it('shifts multi-fragment scopes consistently', () => {
    const [sw0] = ministryScopeWhere(
      mkScope({ roleCodes: ['ministry_leader'], ministryIds: [G1], branchIds: [B1] }),
      'm.branch_id',
      'm.id',
    );
    const sw = sw0.replace(/\$(\d+)/g, (_, i) => `$${Number(i) + 1}`);
    expect(sw).toBe(' AND m.id = ANY($2::uuid[]) AND m.branch_id = ANY($3::uuid[])');
  });
});
