'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const nav = [
  { href: '/dealer', label: 'Dashboard' },
  { href: '/dealer/catalog', label: 'Catalog' },
  { href: '/dealer/customers', label: 'Customers' },
  { href: '/dealer/orders', label: 'Orders' },
  { href: '/dealer/knowledge', label: 'Knowledge Base' },
  { href: '/dealer/settings', label: 'Settings' },
];

export default function DealerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null;

  return (
    <div className="flex h-screen">
      <aside className="w-64 border-r border-border bg-card">
        <div className="p-6">
          <Link href="/dealer" className="text-xl font-bold text-stellar-900">
            Star AI
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">{typeof localStorage !== 'undefined' ? localStorage.getItem('dealer_name') : 'Dealer'}</p>
        </div>
        <nav className="p-4 space-y-1">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? 'bg-stellar-50 text-stellar-700'
                    : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <div className="mt-8 pt-4 border-t border-border">
            <button
              onClick={() => {
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                window.location.href = '/';
              }}
              className="w-full flex items-center rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Sign out
            </button>
          </div>
        </nav>
      </aside>
      <div className="flex-1 overflow-y-auto bg-muted p-6">{children}</div>
    </div>
  );
}
