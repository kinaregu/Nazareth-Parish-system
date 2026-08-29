import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Nazareth Parish ChMS', template: '%s · Nazareth Parish ChMS' },
  description: 'Nazareth Parish Church Management System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {children}
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
