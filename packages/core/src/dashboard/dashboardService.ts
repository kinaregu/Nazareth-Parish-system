/**
 * @nazareth/core — role-aware dashboard.
 * Returns only the widgets the caller's permissions allow:
 *  - pastor: members, attendance, visitors, pastoral, prayer, follow-ups
 *  - finance: giving, expenses, funds
 *  - ministry leader: ministry widgets
 *  - member: own info + upcoming events + announcements
 */
import { query, queryOne } from '@nazareth/db';
import { hasPermission, type AccessScope } from '../rbac/scope';
import { memberStats } from '../members/memberService';
import { visitorStats } from '../visitors/visitorService';
import { attendanceTrend } from '../attendance/attendanceService';
import { givingTrend, givingSummary } from '../finance/givingService';
import { expenseTrend, expenseSummary } from '../finance/expenseService';
import { followupStats } from '../followups/followupService';
import { prayerStats } from '../prayer/prayerService';
import { pastoralStats } from '../pastoral/pastoralService';

export async function getDashboard(scope: AccessScope): Promise<any> {
  const d: any = { role: scope.roleCodes[0] ?? 'member', widgets: [] };

  const canViewMembers = hasPermission(scope, 'members.view');
  const canViewAttendance = hasPermission(scope, 'attendance.view');
  const canViewVisitors = hasPermission(scope, 'visitors.view');
  const canViewFinance = hasPermission(scope, 'giving.view');
  const canViewExpenses = hasPermission(scope, 'expenses.view');
  const canViewPastoral = hasPermission(scope, 'pastoral.view');
  const canViewPrayer = hasPermission(scope, 'prayer.view');
  const canViewFollowups = hasPermission(scope, 'followups.view') || hasPermission(scope, 'followups.create');

  // Upcoming events (shared by most roles)
  const events = await query<any>(
    `SELECT e.id, e.title, e.starts_at, e.location, e.status,
            (SELECT COUNT(*)::int FROM event_registrations er WHERE er.event_id = e.id AND er.status <> 'cancelled') AS registered
       FROM events e
      WHERE e.deleted_at IS NULL AND e.status = 'published' AND e.starts_at >= now() - interval '1 day'
      ORDER BY e.starts_at ASC LIMIT 6`,
  );
  d.upcomingEvents = events;

  if (canViewMembers) {
    d.members = await memberStats(scope);
    d.widgets.push('members');
  }
  if (canViewVisitors) {
    d.visitors = await visitorStats(scope);
    d.widgets.push('visitors');
  }
  if (canViewAttendance) {
    d.attendanceTrend = await attendanceTrend(scope, 12);
    d.widgets.push('attendance');
  }
  if (canViewFollowups) {
    d.followups = await followupStats(scope);
    d.pendingFollowups = await query<any>(
      `SELECT f.id, f.reason, f.due_date, f.priority, u.name AS assigned_to, m.first_name || ' ' || m.last_name AS member_name
         FROM followups f
         LEFT JOIN users u ON u.id = f.assigned_to
         LEFT JOIN members m ON m.id = f.member_id
        WHERE f.status IN ('pending','in_progress')
        ORDER BY CASE f.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, f.due_date LIMIT 6`,
    );
    d.widgets.push('followups');
  }
  if (canViewPastoral) {
    d.pastoral = await pastoralStats(scope);
    d.widgets.push('pastoral');
  }
  if (canViewPrayer) {
    d.prayer = await prayerStats(scope);
    d.widgets.push('prayer');
  }
  if (canViewFinance) {
    d.giving = await givingSummary(scope);
    d.givingTrend = await givingTrend(scope, 6);
    d.widgets.push('giving');
  }
  if (canViewExpenses) {
    d.expenses = await expenseSummary(scope);
    d.expenseTrend = await expenseTrend(scope, 6);
    d.widgets.push('expenses');
  }

  // Ministry leader: their ministry quick stats
  if (scope.roleCodes.includes('ministry_leader') && scope.ministryIds.length > 0) {
    d.myMinistries = await query<any>(
      `SELECT m.id, m.name, m.meeting_day, m.meeting_time,
              (SELECT COUNT(*)::int FROM ministry_members mm WHERE mm.ministry_id = m.id AND mm.is_active) AS members
         FROM ministries m WHERE m.id = ANY($1::uuid[]) AND m.deleted_at IS NULL AND m.is_active ORDER BY m.name`,
      [scope.ministryIds],
    );
    d.widgets.push('ministry');
  }
  if (scope.roleCodes.includes('group_leader') && scope.groupIds.length > 0) {
    d.myGroups = await query<any>(
      `SELECT g.id, g.name, g.meeting_day, g.meeting_time,
              (SELECT COUNT(*)::int FROM group_members gm WHERE gm.group_id = g.id AND gm.is_active) AS members
         FROM groups g WHERE g.id = ANY($1::uuid[]) AND g.deleted_at IS NULL AND g.is_active ORDER BY g.name`,
      [scope.groupIds],
    );
    d.widgets.push('group');
  }

  // Recent announcements (for all authenticated users)
  d.recentAnnouncements = await query<any>(
    `SELECT id, title, created_at FROM announcements
      WHERE org_id = $1 AND status = 'published' AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 4`,
    [scope.orgId],
  );

  return d;
}
