import { redirect } from 'next/navigation';
import { MeProvider, useMe } from '@/components/ui/primitives';
import { AppShell } from '@/components/layout/app-shell';
import { AdminGate } from './admin-gate';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <MeProvider>
      <AdminGate>
        <AdminNav>{children}</AdminNav>
      </AdminGate>
    </MeProvider>
  );
}

function AdminNav({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      home="/dashboard"
      footer="Administration"
      sections={[
        { items: [{ label: 'Dashboard', href: '/dashboard', icon: 'dashboard' }] },
        {
          title: 'People',
          items: [
            { label: 'All Members', href: '/members', perm: 'members.view', icon: 'users' },
            { label: 'Add Member', href: '/members/new', perm: 'members.create', icon: 'users' },
            { label: 'Families', href: '/families', perm: 'families.view', icon: 'home' },
            { label: 'Visitors', href: '/visitors', perm: 'visitors.view', icon: 'users' },
            { label: 'Registrations', href: '/members/registrations', perm: 'registrations.review', icon: 'clipboard' },
            { label: 'Import Members', href: '/members/import', perm: 'members.import', icon: 'list' },
          ],
        },
        {
          title: 'Attendance',
          items: [
            { label: 'Sessions', href: '/attendance', perm: 'attendance.view', icon: 'clipboard' },
            { label: 'Record Attendance', href: '/attendance/new', perm: 'attendance.manage', icon: 'clipboard' },
            { label: 'Reports', href: '/attendance/reports', perm: 'reports.view', icon: 'chart' },
          ],
        },
        {
          title: 'Ministries',
          items: [
            { label: 'Ministries', href: '/ministries', perm: 'ministries.view', icon: 'church' },
            { label: 'Departments', href: '/departments', perm: 'departments.view', icon: 'church' },
            { label: 'Groups', href: '/groups', perm: 'groups.view', icon: 'users' },
          ],
        },
        {
          title: 'Events',
          items: [
            { label: 'Calendar', href: '/calendar', perm: 'events.view', icon: 'calendar' },
            { label: 'Events', href: '/events', perm: 'events.view', icon: 'calendar' },
            { label: 'New Event', href: '/events/new', perm: 'events.manage', icon: 'calendar' },
          ],
        },
        {
          title: 'Communication',
          items: [
            { label: 'Announcements', href: '/announcements', perm: 'announcements.view', icon: 'bell' },
            { label: 'New Announcement', href: '/announcements/new', perm: 'announcements.manage', icon: 'bell' },
            { label: 'Notifications', href: '/notifications', icon: 'bell' },
            { label: 'Message Templates', href: '/admin/templates', perm: 'templates.manage', icon: 'list' },
          ],
        },
        {
          title: 'Pastoral Care',
          items: [
            { label: 'Cases', href: '/pastoral/cases', perm: 'pastoral.view', icon: 'heart' },
            { label: 'Follow-ups', href: '/pastoral/followups', perm: 'followups.view', icon: 'clipboard' },
            { label: 'Prayer Requests', href: '/pastoral/prayer-requests', perm: 'prayer.view', icon: 'heart' },
          ],
        },
        {
          title: 'Finance',
          items: [
            { label: 'Giving', href: '/finance/giving', perm: 'giving.view', icon: 'coin' },
            { label: 'Funds', href: '/finance/funds', perm: 'funds.manage', icon: 'coin' },
            { label: 'Expenses', href: '/finance/expenses', perm: 'expenses.view', icon: 'coin' },
            { label: 'Financial Reports', href: '/finance/reports', perm: 'finance.view', icon: 'chart' },
          ],
        },
        {
          title: 'Insights',
          items: [{ label: 'Reports', href: '/reports', perm: 'reports.view', icon: 'chart' }],
        },
        {
          title: 'Administration',
          items: [
            { label: 'Users', href: '/admin/users', perm: 'users.manage', icon: 'users' },
            { label: 'Roles & Permissions', href: '/admin/roles', perm: 'roles.manage', icon: 'shield' },
            { label: 'Audit Logs', href: '/admin/audit-logs', perm: 'audit.view', icon: 'clipboard' },
            { label: 'Backups', href: '/admin/backups', perm: 'backups.manage', icon: 'shield' },
            { label: 'Dev Outbox', href: '/admin/outbox', perm: 'backups.manage', icon: 'list' },
            { label: 'Settings', href: '/admin/settings', perm: 'settings.manage', icon: 'cog' },
          ],
        },
      ]}
    >
      {children}
    </AppShell>
  );
}
