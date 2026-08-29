import { describe, expect, it } from 'vitest';
import {
  loginSchema,
  createMemberSchema,
  createExpenseSchema,
  expensePaySchema,
} from '@nazareth/shared';

const BRANCH = '4dd90c64-3567-4907-b05d-a13225558ab8';
const FUND = '12345678-1234-4234-8234-123456789abc';
const CAT = '87654321-4321-4321-8321-cba765432109';

describe('loginSchema', () => {
  it('accepts a valid login', () => {
    const r = loginSchema.safeParse({ email: 'pastor@nazarethparish.org', password: 'Password123' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.remember).toBe(false);
  });

  it('rejects a malformed email', () => {
    expect(loginSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
  });

  it('rejects an empty password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});

describe('createMemberSchema', () => {
  const valid = { branch_id: BRANCH, first_name: 'Grace', last_name: 'Otieno' };

  it('accepts the minimal profile and applies defaults', () => {
    const r = createMemberSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe('active');
      expect(r.data.member_type).toBe('regular');
      expect(r.data.baptism_status).toBe('none');
    }
  });

  it('rejects a missing last name', () => {
    const r = createMemberSchema.safeParse({ branch_id: BRANCH, first_name: 'Grace' });
    expect(r.success).toBe(false);
  });

  it('rejects a non-uuid branch_id', () => {
    expect(createMemberSchema.safeParse({ ...valid, branch_id: 'main' }).success).toBe(false);
  });
});

describe('createExpenseSchema', () => {
  const valid = {
    branch_id: BRANCH,
    fund_id: FUND,
    category_id: CAT,
    title: 'Fix broken door',
    amount: 42,
    expense_date: '2026-08-25',
    method: 'cash',
  };

  it('accepts a valid expense and defaults submit=false', () => {
    const r = createExpenseSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.submit).toBe(false);
  });

  it('rejects zero or negative amounts', () => {
    expect(createExpenseSchema.safeParse({ ...valid, amount: 0 }).success).toBe(false);
    expect(createExpenseSchema.safeParse({ ...valid, amount: -5 }).success).toBe(false);
  });

  it('rejects an unknown payment method', () => {
    expect(createExpenseSchema.safeParse({ ...valid, method: 'crypto' }).success).toBe(false);
  });
});

describe('expensePaySchema', () => {
  it('accepts a date-only paid_at', () => {
    expect(expensePaySchema.safeParse({ paid_at: '2026-08-29' }).success).toBe(true);
  });

  it('rejects a full ISO timestamp (date-only contract)', () => {
    expect(expensePaySchema.safeParse({ paid_at: '2026-08-29T10:00:00.000Z' }).success).toBe(false);
  });

  it('rejects a missing paid_at', () => {
    expect(expensePaySchema.safeParse({}).success).toBe(false);
  });
});
