/**
 * @nazareth/shared — permission catalog.
 *
 * This is the single source of truth for permission codes used by:
 *  - the database seed (permissions table)
 *  - backend guards (packages/core)
 *  - frontend menu/action visibility (apps/web)
 *
 * IMPORTANT: frontend use is UX only. Every API endpoint re-checks
 * permissions server-side (see core/rbac.ts).
 */

export interface PermissionDef {
  code: string;
  label: string;
  module: string;
  description?: string;
}

export const PERMISSIONS: PermissionDef[] = [
  // ── Members ────────────────────────────────────────────────────────────────
  { code: 'members.view', label: 'View members', module: 'members' },
  { code: 'members.view_sensitive', label: 'View sensitive member data', module: 'members', description: 'Full contact details, notes, family and emergency contacts' },
  { code: 'members.create', label: 'Create members', module: 'members' },
  { code: 'members.edit', label: 'Edit members', module: 'members' },
  { code: 'members.delete', label: 'Delete (archive) members', module: 'members' },
  { code: 'members.manage_status', label: 'Change membership status', module: 'members' },
  { code: 'members.export', label: 'Export members', module: 'members' },
  { code: 'members.import', label: 'Import members', module: 'members' },
  // ── Families ───────────────────────────────────────────────────────────────
  { code: 'families.view', label: 'View families', module: 'families' },
  { code: 'families.create', label: 'Create families', module: 'families' },
  { code: 'families.edit', label: 'Edit families', module: 'families' },
  { code: 'families.delete', label: 'Delete families', module: 'families' },
  // ── Visitors ──────────────────────────────────────────────────────────────
  { code: 'visitors.view', label: 'View visitors', module: 'visitors' },
  { code: 'visitors.create', label: 'Register visitors', module: 'visitors' },
  { code: 'visitors.edit', label: 'Edit visitors', module: 'visitors' },
  { code: 'visitors.delete', label: 'Delete visitors', module: 'visitors' },
  { code: 'visitors.convert', label: 'Convert visitors to members', module: 'visitors' },
  // ── Attendance ────────────────────────────────────────────────────────────
  { code: 'attendance.view', label: 'View attendance', module: 'attendance' },
  { code: 'attendance.manage', label: 'Record & edit attendance', module: 'attendance' },
  { code: 'attendance.export', label: 'Export attendance', module: 'attendance' },
  // ── Ministries / Departments / Groups ─────────────────────────────────────
  { code: 'ministries.view', label: 'View ministries', module: 'ministries' },
  { code: 'ministries.manage', label: 'Manage ministries', module: 'ministries' },
  { code: 'departments.view', label: 'View departments', module: 'departments' },
  { code: 'departments.manage', label: 'Manage departments', module: 'departments' },
  { code: 'groups.view', label: 'View groups', module: 'groups' },
  { code: 'groups.manage', label: 'Manage groups', module: 'groups' },
  // ── Events ─────────────────────────────────────────────────────────────────
  { code: 'events.view', label: 'View events', module: 'events' },
  { code: 'events.manage', label: 'Create & edit events', module: 'events' },
  { code: 'events.register', label: 'Register for events', module: 'events' },
  { code: 'events.manage_registrations', label: 'Manage event registrations', module: 'events' },
  // ── Communication ────────────────────────────────────────────────────────
  { code: 'announcements.view', label: 'View announcements', module: 'announcements' },
  { code: 'announcements.manage', label: 'Create & edit announcements', module: 'announcements' },
  { code: 'templates.manage', label: 'Manage message templates', module: 'communication' },
  // ── Pastoral ──────────────────────────────────────────────────────────────
  { code: 'pastoral.view', label: 'View pastoral care records', module: 'pastoral' },
  { code: 'pastoral.manage', label: 'Manage pastoral care records', module: 'pastoral' },
  // ── Prayer ────────────────────────────────────────────────────────────────
  { code: 'prayer.view', label: 'View prayer requests', module: 'prayer' },
  { code: 'prayer.create', label: 'Submit prayer requests', module: 'prayer' },
  { code: 'prayer.manage', label: 'Manage prayer requests (assign/close)', module: 'prayer' },
  // ── Follow-ups ─────────────────────────────────────────────────────────────
  { code: 'followups.view', label: 'View follow-ups', module: 'followups' },
  { code: 'followups.create', label: 'Create follow-ups', module: 'followups' },
  { code: 'followups.manage', label: 'Manage follow-ups', module: 'followups' },
  // ── Finance ────────────────────────────────────────────────────────────────
  { code: 'giving.view', label: 'View giving records', module: 'finance' },
  { code: 'giving.create', label: 'Record giving', module: 'finance' },
  { code: 'giving.export', label: 'Export giving data', module: 'finance' },
  { code: 'funds.manage', label: 'Manage funds', module: 'finance' },
  { code: 'expenses.view', label: 'View expenses', module: 'finance' },
  { code: 'expenses.create', label: 'Submit expenses', module: 'finance' },
  { code: 'expenses.approve', label: 'Approve / reject / pay expenses', module: 'finance' },
  { code: 'expenses.export', label: 'Export expenses', module: 'finance' },
  { code: 'finance.view', label: 'View financial reports', module: 'finance' },
  // ── Reports ────────────────────────────────────────────────────────────────
  { code: 'reports.view', label: 'View reports', module: 'reports' },
  // ── Administration ─────────────────────────────────────────────────────────
  { code: 'users.manage', label: 'Manage users', module: 'admin' },
  { code: 'roles.manage', label: 'Manage roles & permissions', module: 'admin' },
  { code: 'settings.manage', label: 'Manage church settings', module: 'admin' },
  { code: 'audit.view', label: 'View audit logs', module: 'admin' },
  { code: 'backups.manage', label: 'Manage backups', module: 'admin' },
  { code: 'registrations.review', label: 'Review member registrations', module: 'admin' },
  { code: 'files.manage', label: 'Manage files & documents', module: 'admin' },
];

export const PERMISSION_CODES = PERMISSIONS.map((p) => p.code) as string[];

/**
 * Default permission sets per system role.
 * The `visitor` role intentionally has no API permissions (public self-service
 * registration only). Members interact via the portal with implicit
 * "own record" access, not through global permissions.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['*'],
  pastor: [
    'members.view', 'members.view_sensitive',
    'families.view',
    'visitors.view', 'visitors.create', 'visitors.edit', 'visitors.convert',
    'attendance.view', 'attendance.manage',
    'ministries.view', 'departments.view', 'groups.view', 'groups.manage',
    'events.view', 'events.manage',
    'announcements.view', 'announcements.manage',
    'pastoral.view', 'pastoral.manage',
    'prayer.view', 'prayer.create', 'prayer.manage',
    'followups.view', 'followups.create', 'followups.manage',
    'reports.view',
  ],
  admin: [
    'members.view', 'members.view_sensitive', 'members.create', 'members.edit', 'members.delete',
    'members.manage_status', 'members.export', 'members.import',
    'families.view', 'families.create', 'families.edit',
    'visitors.view', 'visitors.create', 'visitors.edit', 'visitors.convert',
    'attendance.view', 'attendance.manage', 'attendance.export',
    'ministries.view', 'departments.view', 'groups.view',
    'events.view', 'events.manage', 'events.manage_registrations',
    'announcements.view', 'announcements.manage',
    'templates.manage',
    'prayer.view', 'prayer.manage',
    'followups.view', 'followups.create', 'followups.manage',
    'reports.view',
    'settings.manage',
    'registrations.review',
    'files.manage',
  ],
  finance: [
    'members.view',
    'giving.view', 'giving.create', 'giving.export',
    'funds.manage',
    'expenses.view', 'expenses.create', 'expenses.approve', 'expenses.export',
    'finance.view',
    'reports.view',
  ],
  ministry_leader: [
    'members.view',
    'ministries.view', 'ministries.manage',
    'departments.view', 'groups.view',
    'attendance.view', 'attendance.manage',
    'events.view', 'events.manage',
    'announcements.view', 'announcements.manage',
    'prayer.view', 'prayer.create',
    'followups.view', 'followups.create', 'followups.manage',
    'reports.view',
  ],
  group_leader: [
    'members.view',
    'groups.view', 'groups.manage',
    'attendance.view', 'attendance.manage',
    'events.view', 'events.manage',
    'announcements.view', 'announcements.manage',
    'prayer.view', 'prayer.create',
    'followups.view', 'followups.create', 'followups.manage',
    'reports.view',
  ],
  member: [],
  visitor: [],
};

export interface RoleDef {
  code: string;
  name: string;
  description: string;
}

export const SYSTEM_ROLES: RoleDef[] = [
  { code: 'super_admin', name: 'Super Administrator', description: 'Full system access including settings, users, roles and audit logs.' },
  { code: 'pastor', name: 'Pastor', description: 'Shepherding access: members, attendance, pastoral care, prayer, follow-ups. No financial administration by default.' },
  { code: 'admin', name: 'Church Administrator', description: 'Day-to-day administration: records, events, communication, reports. No financial or pastoral access.' },
  { code: 'finance', name: 'Finance Officer', description: 'Giving, funds, expenses, financial reports. No access to pastoral records.' },
  { code: 'ministry_leader', name: 'Ministry Leader', description: 'Scoped to their own ministry: members, attendance, events, communication.' },
  { code: 'group_leader', name: 'Group Leader', description: 'Scoped to their own group: members, attendance, events, follow-ups.' },
  { code: 'member', name: 'Member', description: 'Member portal: own profile, events, announcements, prayer, giving (when enabled).' },
  { code: 'visitor', name: 'Visitor', description: 'Limited public account: register interest and public events.' },
];
