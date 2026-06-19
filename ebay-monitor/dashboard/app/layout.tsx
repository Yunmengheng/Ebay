import type { Metadata } from 'next';
import Link from 'next/link';
import { Activity, Bell, Settings, Store as StoreIcon } from 'lucide-react';
import { RealtimeProvider } from '@/components/RealtimeProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'eBay Message Monitor Pro',
  description: 'Real-time eBay inbox monitoring dashboard'
};

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: Activity },
  { href: '/stores', label: 'Stores', icon: StoreIcon },
  { href: '/settings', label: 'Settings', icon: Settings }
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <RealtimeProvider>
          <div className="min-h-screen bg-background">
            <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
              <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
                <Link href="/dashboard" className="flex min-w-0 items-center gap-2 font-semibold text-white">
                  <Bell className="h-5 w-5 text-accent" />
                  <span className="truncate">eBay Message Monitor Pro</span>
                </Link>
                <nav className="flex items-center gap-1">
                  {nav.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex h-9 items-center gap-2 rounded-md px-3 text-sm text-neutral-300 transition hover:bg-panel hover:text-white"
                    >
                      <item.icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{item.label}</span>
                    </Link>
                  ))}
                </nav>
              </div>
            </header>
            <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6">{children}</main>
          </div>
        </RealtimeProvider>
      </body>
    </html>
  );
}

