/**
 * @nazareth/shared — shared Zod validation schemas.
 *
 * The SAME schemas are used by:
 *  - backend API controllers (packages/core via apps/web/api) — source of truth
 *  - frontend forms — instant client feedback
 *
 * Nothing from the browser is trusted: every request is re-validated server-side.
 */
import { z } from 'zod';

export const uuid = z.string().uuid('Must be a valid id');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export const email = z.string().trim().email('Enter a valid email address').max(190);
export const phone = z
  .string()
  .trim()
  .max(30)
  .regex(/^[+\d][\d\s().-]{5,29}$/, 'Enter a valid phone number');
export const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[a-zA-Z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date');

/* ─────────────────────────── Auth ─────────────────────────── */

export const loginSchema = z.object({
  email: email,
  password: z.string().min(1, 'Password is required').max(128),
  remember: z.boolean().optional().default(false),
  totpCode: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code').optional(),
});

export const forgotPasswordSchema = z.object({ email: email });

export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(200),
  password: password,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: password,
});

export const totpSetupSchema = z.object({});
export const totpEnableSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') });

export const notificationPrefsSchema = z.object({
  email_announcements: z.boolean().default(true),
  email_events: z.boolean().default(true),
  email_groups: z.boolean().default(true),
  sms_events: z.boolean().default(false),
  sms_followup: z.boolean().default(false),
});

/* ─────────────────────────── Members ─────────────────────────────────────────── */

export const memberBaseSchema = z.object({
  branch_id: uuid,
  first_name: z.string().trim().min(1, 'First name is required').max(80),
  middle_name: z.string().trim().max(80).optional().or(z.literal('')),
  last_name: z.string().trim().min(1, 'Last name is required').max(80),
  preferred_name: z.string().trim().max(80).optional().or(z.literal('')),
  gender: z.enum(['male', 'female', 'other']).optional(),
  date_of_birth: dateStr.optional().or(z.literal('')),
  phone: phone.optional().or(z.literal('')),
  email: email.optional().or(z.literal('')),
  address: z.string().trim().max(255).optional().or(z.literal('')),
  city: z.string().trim().max(80).optional().or(z.literal('')),
  country: z.string().trim().max(80).optional().or(z.literal('')),
  emergency_contact_name: z.string().trim().max(120).optional().or(z.literal('')),
  emergency_contact_phone: phone.optional().or(z.literal('')),
  status: z.string().trim().max(40).default('active'),
  member_type: z.enum(['regular', 'associate', 'honorary']).default('regular'),
  date_joined: dateStr.optional().or(z.literal('')),
  first_attendance: dateStr.optional().or(z.literal('')),
  baptism_status: z.enum(['none', 'baptized', 'pending', 'not_applicable']).default('none'),
  baptism_date: dateStr.optional().or(z.literal('')),
  confirmation_status: z.enum(['none', 'confirmed', 'pending', 'not_applicable']).default('none'),
  confirmation_date: dateStr.optional().or(z.literal('')),
  previous_church: z.string().trim().max(160).optional().or(z.literal('')),
  skills: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  interests: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  volunteer: z.boolean().default(false),
  notes: z.string().trim().max(4000).optional().or(z.literal('')),
});

export const createMemberSchema = memberBaseSchema;
export const updateMemberSchema = memberBaseSchema.partial();

export const memberListQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.string().optional(),
  branch_id: uuid.optional(),
  ministry_id: uuid.optional(),
  department_id: uuid.optional(),
  group_id: uuid.optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  age_min: z.coerce.number().int().min(0).max(130).optional(),
  age_max: z.coerce.number().int().min(0).max(130).optional(),
  baptism_status: z.enum(['none', 'baptized', 'pending', 'not_applicable']).optional(),
  date_joined_from: dateStr.optional(),
  date_joined_to: dateStr.optional(),
});

export const statusChangeSchema = z.object({
  status: z.string().trim().min(1).max(40),
  reason: z.string().trim().max(500).optional(),
});

export const memberImportSchema = z.object({
  branch_id: uuid,
  skip_duplicates: z.boolean().default(true),
});

/* ─────────────────────────── Families ─────────────────────────────────────────── */

export const createFamilySchema = z.object({
  branch_id: uuid,
  name: z.string().trim().min(1, 'Household name is required').max(120),
  address: z.string().trim().max(255).optional().or(z.literal('')),
  city: z.string().trim().max(80).optional().or(z.literal('')),
  country: z.string().trim().max(80).optional().or(z.literal('')),
  phone: phone.optional().or(z.literal('')),
  email: email.optional().or(z.literal('')),
  primary_contact_id: uuid.optional().or(z.literal('')),
  note: z.string().trim().max(1000).optional().or(z.literal('')),
  member_ids: z.array(uuid).default([]),
  member_roles: z.record(uuid, z.enum(['head', 'spouse', 'child', 'other'])).default({}),
});
export const updateFamilySchema = createFamilySchema.extend({ member_ids: z.array(uuid).default([]), member_roles: z.record(uuid, z.enum(['head', 'spouse', 'child', 'other'])).default({}) });

/* ─────────────────────────── Visitors ─────────────────────────────────────────── */

export const createVisitorSchema = z.object({
  branch_id: uuid,
  service_id: uuid.optional().or(z.literal('')),
  visit_date: dateStr,
  first_name: z.string().trim().min(1, 'First name is required').max(80),
  middle_name: z.string().trim().max(80).optional().or(z.literal('')),
  last_name: z.string().trim().max(80).optional().or(z.literal('')),
  phone: phone.optional().or(z.literal('')),
  email: email.optional().or(z.literal('')),
  address: z.string().trim().max(255).optional().or(z.literal('')),
  city: z.string().trim().max(80).optional().or(z.literal('')),
  heard_from: z.string().trim().max(60).optional().or(z.literal('')),
  invited_by: z.string().trim().max(160).optional().or(z.literal('')),
  interests: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  assigned_to: uuid.optional().or(z.literal('')),
  note: z.string().trim().max(2000).optional().or(z.literal('')),
});
export const updateVisitorSchema = createVisitorSchema.partial();
export const visitorConvertSchema = z.object({
  status: z.enum(['visitor', 'new_member', 'active']).default('new_member'),
  branch_id: uuid,
});

/* ─────────────────────────── Attendance ─────────────────────────────────────────── */

export const createSessionSchema = z.object({
  service_id: uuid,
  session_date: dateStr,
  note: z.string().trim().max(500).optional().or(z.literal('')),
});

export const attendanceEntrySchema = z.object({
  member_id: uuid.optional().or(z.literal('')),
  visitor_id: uuid.optional().or(z.literal('')),
  status: z.enum(['present', 'absent', 'excused', 'visitor', 'first_time']),
});
export const saveAttendanceSchema = z.object({
  session_id: uuid,
  entries: z.array(attendanceEntrySchema).min(1).max(2000),
});

/* ─────────────────────────── Ministries / Departments / Groups ─────────────────────────── */

export const createMinistrySchema = z.object({
  branch_id: uuid,
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  leader_id: uuid.optional().or(z.literal('')),
  assistant_leader_id: uuid.optional().or(z.literal('')),
  meeting_day: z.string().trim().max(30).optional().or(z.literal('')),
  meeting_time: z.string().trim().max(20).optional().or(z.literal('')),
  location: z.string().trim().max(160).optional().or(z.literal('')),
});
export const updateMinistrySchema = createMinistrySchema.partial();
export const ministryMembersSchema = z.object({
  entries: z.array(z.object({
    member_id: uuid,
    role: z.enum(['leader', 'assistant', 'member']),
    active: z.boolean().default(true),
  })),
});

export const createDepartmentSchema = z.object({
  branch_id: uuid,
  ministry_id: uuid.optional().or(z.literal('')),
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  leader_id: uuid.optional().or(z.literal('')),
  responsibilities: z.string().trim().max(2000).optional().or(z.literal('')),
});
export const updateDepartmentSchema = createDepartmentSchema.partial();

export const createGroupSchema = z.object({
  branch_id: uuid,
  name: z.string().trim().min(1, 'Group name is required').max(120),
  type: z.string().trim().min(1).max(40).default('cell'),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  leader_id: uuid.optional().or(z.literal('')),
  assistant_leader_id: uuid.optional().or(z.literal('')),
  location: z.string().trim().max(160).optional().or(z.literal('')),
  meeting_day: z.string().trim().max(30).optional().or(z.literal('')),
  meeting_time: z.string().trim().max(20).optional().or(z.literal('')),
  status: z.enum(['active', 'inactive']).default('active'),
});
export const updateGroupSchema = createGroupSchema.partial();
export const groupMembersSchema = z.object({
  entries: z.array(z.object({
    member_id: uuid,
    role: z.enum(['leader', 'assistant', 'member']),
    active: z.boolean().default(true),
  })),
});

/* ─────────────────────────── Services ─────────────────────────────────────────── */

export const createServiceSchema = z.object({
  branch_id: uuid,
  name: z.string().trim().min(1, 'Name is required').max(120),
  category: z.enum(['sunday', 'midweek', 'bible_study', 'prayer_meeting', 'youth', 'children', 'ministry', 'special']),
  day_of_week: z.number().int().min(0).max(6).optional(),
  time: z.string().trim().max(10).optional().or(z.literal('')),
  location: z.string().trim().max(160).optional().or(z.literal('')),
  active: z.boolean().default(true),
});
export const updateServiceSchema = createServiceSchema.partial();

/* ─────────────────────────── Events ─────────────────────────────────────────── */

export const createEventSchema = z.object({
  branch_id: uuid,
  title: z.string().trim().min(1, 'Title is required').max(160),
  description: z.string().trim().max(4000).optional().or(z.literal('')),
  starts_at: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}[T ]/)).refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid start date/time'),
  ends_at: z.string().optional().or(z.literal('')).refine((v) => !v || !Number.isNaN(Date.parse(v)), 'Invalid end date/time'),
  location: z.string().trim().max(160).optional().or(z.literal('')),
  capacity: z.coerce.number().int().min(0).max(100000).optional(),
  registration_required: z.boolean().default(false),
  registration_deadline: z.string().optional().or(z.literal('')).refine((v) => !v || !Number.isNaN(Date.parse(v)), 'Invalid deadline'),
  status: z.enum(['draft', 'published', 'completed', 'cancelled']).default('draft'),
  visibility: z.enum(['public', 'members', 'ministry', 'group']).default('members'),
  ministry_id: uuid.optional().or(z.literal('')),
  department_id: uuid.optional().or(z.literal('')),
  group_id: uuid.optional().or(z.literal('')),
});
export const updateEventSchema = createEventSchema.partial();
export const registerForEventSchema = z.object({
  event_id: uuid,
  status: z.enum(['registered', 'attended', 'absent', 'cancelled']).default('registered'),
  note: z.string().trim().max(500).optional().or(z.literal('')),
});

/* ─────────────────────────── Announcements ─────────────────────────────────────────── */

export const audienceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all') }),
  z.object({ type: z.literal('branch'), branch_id: uuid }),
  z.object({ type: z.literal('ministry'), ministry_id: uuid }),
  z.object({ type: z.literal('department'), department_id: uuid }),
  z.object({ type: z.literal('group'), group_id: uuid }),
  z.object({ type: z.literal('members'), member_ids: z.array(uuid).min(1) }),
  z.object({ type: z.literal('role'), role: z.string().min(1) }),
]);

/** Audience targeting shape (see audienceSchema). */
export type Audience = z.infer<typeof audienceSchema>;

export const createAnnouncementSchema = z.object({
  branch_id: uuid,
  title: z.string().trim().min(1, 'Title is required').max(200),
  content: z.string().trim().min(1, 'Content is required').max(20000),
  audience: audienceSchema,
  status: z.enum(['draft', 'scheduled', 'published']).default('draft'),
  publish_at: z.string().optional().or(z.literal('')).refine((v) => !v || !Number.isNaN(Date.parse(v)), 'Invalid publish date'),
  expires_at: z.string().optional().or(z.literal('')).refine((v) => !v || !Number.isNaN(Date.parse(v)), 'Invalid expiry date'),
});
export const updateAnnouncementSchema = createAnnouncementSchema.partial();

/* ─────────────────────────── Pastoral ─────────────────────────────────────────── */

export const createPastoralCaseSchema = z.object({
  member_id: uuid,
  type: z.enum(['counseling', 'home_visit', 'hospital_visit', 'bereavement', 'marriage_support', 'crisis_support', 'followup']),
  title: z.string().trim().min(1, 'Title is required').max(200),
  assigned_to: uuid.optional().or(z.literal('')),
});
export const updatePastoralCaseSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  assigned_to: uuid.optional().or(z.literal('')),
  resolution: z.string().trim().max(2000).optional().or(z.literal('')),
});
export const pastoralNoteSchema = z.object({
  body: z.string().trim().min(1, 'Note is required').max(8000),
  sensitive: z.boolean().default(true),
});

/* ─────────────────────────── Prayer ─────────────────────────────────────────── */

export const createPrayerSchema = z.object({
  member_id: uuid.optional().or(z.literal('')),
  text: z.string().trim().min(3, 'Please describe the request (min 3 characters)').max(4000),
  category: z.enum(['health', 'family', 'financial', 'work', 'spiritual', 'gratitude', 'other']).default('other'),
  visibility: z.enum(['private', 'pastoral', 'ministry', 'group', 'church']).default('private'),
  ministry_id: uuid.optional().or(z.literal('')),
  group_id: uuid.optional().or(z.literal('')),
});
export const managePrayerSchema = z.object({
  status: z.enum(['active', 'prayed', 'closed']).optional(),
  assigned_to: uuid.optional().or(z.literal('')),
});

/* ─────────────────────────── Follow-ups ─────────────────────────────────────────── */

export const createFollowupSchema = z.object({
  subject_type: z.enum(['visitor', 'member', 'event', 'prayer', 'pastoral', 'manual']),
  subject_id: uuid,
  member_id: uuid.optional().or(z.literal('')),
  reason: z.string().trim().min(1, 'Reason is required').max(500),
  assigned_to: uuid,
  due_date: dateStr,
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  note: z.string().trim().max(2000).optional().or(z.literal('')),
});
export const updateFollowupSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  outcome: z.string().trim().max(1000).optional().or(z.literal('')),
  note: z.string().trim().max(2000).optional().or(z.literal('')),
});

/* ─────────────────────────── Finance ─────────────────────────────────────────── */

export const createFundSchema = z.object({
  branch_id: uuid,
  name: z.string().trim().min(1, 'Name is required').max(120),
  code: z.string().trim().min(2).max(40).regex(/^[a-z0-9_]+$/, 'Lowercase letters, numbers, underscores'),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  opening_balance: z.coerce.number().min(0).max(999999999).default(0),
  active: z.boolean().default(true),
});
export const updateFundSchema = createFundSchema.partial();

export const createGivingSchema = z.object({
  branch_id: uuid,
  fund_id: uuid,
  member_id: uuid.optional().or(z.literal('')),
  amount: z.coerce.number().positive('Amount must be greater than zero').max(999999999).refine((n) => n <= 999999999),
  tx_date: dateStr,
  method: z.enum(['cash', 'check', 'online', 'mobile_money', 'bank_transfer', 'other']),
  reference: z.string().trim().max(120).optional().or(z.literal('')),
  is_anonymous: z.boolean().default(false),
  note: z.string().trim().max(500).optional().or(z.literal('')),
});
export const reverseGivingSchema = z.object({
  reason: z.string().trim().min(3, 'A reason is required to reverse a giving record').max(500),
});

export const createExpenseSchema = z.object({
  branch_id: uuid,
  fund_id: uuid,
  category_id: uuid,
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  amount: z.coerce.number().positive('Amount must be greater than zero').max(999999999),
  expense_date: dateStr,
  vendor: z.string().trim().max(160).optional().or(z.literal('')),
  method: z.enum(['cash', 'check', 'online', 'mobile_money', 'bank_transfer', 'other']),
  reference: z.string().trim().max(120).optional().or(z.literal('')),
  submit: z.boolean().default(false),
});
export const updateExpenseSchema = createExpenseSchema.partial().omit({ submit: true });
export const expenseDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(500).optional().or(z.literal('')),
});
export const expensePaySchema = z.object({
  paid_at: dateStr,
});

/* ─────────────────────────── Users / Admin ─────────────────────────────────────────── */

export const createUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: email,
  phone: phone.optional().or(z.literal('')),
  branch_id: uuid.optional().or(z.literal('')),
  role_codes: z.array(z.string().min(1)).min(1, 'Assign at least one role'),
  member_id: uuid.optional().or(z.literal('')),
});
export const updateUserSchema = createUserSchema.extend({
  active: z.boolean().optional(),
  must_change_password: z.boolean().optional(),
});

export const updateRoleSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  permission_codes: z.array(z.string().min(1)).optional(),
});

/* ─────────────────────────── Settings ─────────────────────────────────────────── */

export const updateSettingsSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  address: z.string().trim().max(255).optional().or(z.literal('')),
  phone: phone.optional().or(z.literal('')),
  email: email.optional().or(z.literal('')),
  website: z.string().trim().max(200).optional().or(z.literal('')),
  timezone: z.string().trim().max(60).optional().or(z.literal('')),
  currency: z.string().trim().length(3).optional(),
  date_format: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']).optional(),
  country: z.string().trim().max(80).optional().or(z.literal('')),
  default_language: z.string().trim().max(10).optional().or(z.literal('')),
  member_self_view_giving: z.boolean().optional(),
  member_editable_fields: z.array(z.enum(['preferred_name', 'phone', 'email', 'address', 'city', 'country', 'emergency_contact_name', 'emergency_contact_phone'])).optional(),
});

export const createStatusSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[a-z0-9_]+$/, 'Lowercase letters, numbers, underscores'),
  name: z.string().trim().min(1).max(60),
  color: z.string().trim().max(20).default('#1e3a8a'),
  active: z.boolean().default(true),
});
