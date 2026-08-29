import { MeProvider } from '@/components/ui/primitives';
import { AppShell } from '@/components/layout/app-shell';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <MeProvider>
      <AppShell
        home="/portal"
        footer="Member Portal"
        sections={[
          { items: [{ label: 'Dashboard', href: '/portal', icon: 'dashboard' }] },
          {
            title: 'My Life at Church',
            items: [
              { label: 'My Profile', href: '/portal/profile', icon: 'users' },
              { label: 'My Family', href: '/portal/family', icon: 'home' },
              { label: 'My Groups', href: '/portal/groups', icon: 'users' },
              { label: 'My Ministries', href: '/portal/ministries', icon: 'church' },
              { label: 'My Attendance', href: '/portal/attendance', icon: 'clipboard' },
              { label: 'My Giving', href: '/portal/giving', icon: 'coin' },
            ],
          },
          {
            title: 'Church',
            items: [
              { label: 'Events', href: '/portal/events', icon: 'calendar' },
              { label: 'Announcements', href: '/portal/announcements', icon: 'bell' },
              { label: 'Prayer Requests', href: '/portal/prayer-requests', icon: 'heart' },
              { label: 'Notifications', href: '/notifications', icon: 'bell' },
              { label: 'Settings', href: '/portal/settings', icon: 'cog' },
            ],
          },
        ]}
      >
        {children}
      </AppShell>
    </MeProvider>
  );
}
