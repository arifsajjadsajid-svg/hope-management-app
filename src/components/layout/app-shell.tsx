'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, LogOut, KeyRound, UserCircle2, Bell, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sidebar, type VisibleNavGroup } from './sidebar';
import { GlobalSearch } from './global-search';
import { logoutAction } from '@/server/actions/auth';

export type ShellUser = {
  fullName: string;
  roleName: string;
  roleCode: string;
  username: string;
};

export function AppShell({
  navigation,
  user,
  academyName,
  academyShortName,
  academyAddress,
  logoPath,
  unreadCount,
  canSearch,
  children,
}: {
  navigation: VisibleNavGroup[];
  user: ShellUser;
  academyName: string;
  academyShortName: string;
  academyAddress: string;
  logoPath: string | null;
  unreadCount: number;
  canSearch: boolean;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const pathname = usePathname();

  // Close the mobile drawer whenever the route changes.
  React.useEffect(() => setSidebarOpen(false), [pathname]);

  return (
    <div className="min-h-screen bg-[#f4f6fa]">
      <Sidebar
        navigation={navigation}
        academyName={academyName}
        academyShortName={academyShortName}
        academyAddress={academyAddress}
        logoPath={logoPath}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="lg:pl-[264px]">
        <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-navy-700 transition hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>

            {canSearch ? (
              <GlobalSearch />
            ) : (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-navy-900">{academyName}</p>
              </div>
            )}

            <div className="ml-auto flex items-center gap-1.5">
              <Link
                href="/notifications"
                className="relative rounded-lg p-2 text-navy-700 transition hover:bg-slate-100"
                aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
              >
                <Bell className="h-[18px] w-[18px]" />
                {unreadCount > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>

              <UserMenu user={user} />
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>

        <footer className="no-print border-t border-slate-200 px-4 py-5 text-center text-[12px] text-slate-500 sm:px-6">
          <p className="font-semibold uppercase tracking-wide text-navy-800">{academyName}</p>
          <p className="mt-0.5">{academyAddress}</p>
        </footer>
      </div>
    </div>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initials = user.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'flex items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-2 transition hover:bg-slate-100',
          open && 'bg-slate-100',
        )}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-900 text-[12.5px] font-bold text-gold-300">
          {initials}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-[150px] truncate text-[13px] font-bold leading-tight text-navy-900">
            {user.fullName}
          </span>
          <span className="block max-w-[150px] truncate text-[11px] leading-tight text-slate-500">
            {user.roleName}
          </span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-elevated animate-in"
        >
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <p className="truncate text-sm font-bold text-navy-900">{user.fullName}</p>
            <p className="truncate text-[12px] text-slate-500">@{user.username}</p>
            <p className="mt-1 inline-flex rounded-full bg-navy-900 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-gold-300">
              {user.roleName}
            </p>
          </div>

          <div className="p-1.5">
            <Link
              href="/account"
              role="menuitem"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-navy-800 transition hover:bg-slate-100"
            >
              <UserCircle2 className="h-4 w-4 text-slate-500" />
              My Account
            </Link>
            <Link
              href="/account/password"
              role="menuitem"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-navy-800 transition hover:bg-slate-100"
            >
              <KeyRound className="h-4 w-4 text-slate-500" />
              Change Password
            </Link>
          </div>

          <form action={logoutAction} className="border-t border-slate-100 p-1.5">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-rose-700 transition hover:bg-rose-50"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
