'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Icons from 'lucide-react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Crest } from '@/components/brand/crest';

export type VisibleNavLink = { label: string; href: string; exact?: boolean };
export type VisibleNavGroup = {
  label: string;
  icon: string;
  href?: string;
  children?: VisibleNavLink[];
};

function Icon({ name, className }: { name: string; className?: string }) {
  const Cmp = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  if (!Cmp) return <Icons.Circle className={className} />;
  return <Cmp className={className} />;
}

function isLinkActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  navigation,
  academyName,
  academyShortName,
  academyAddress,
  logoPath,
  open,
  onClose,
}: {
  navigation: VisibleNavGroup[];
  academyName: string;
  academyShortName: string;
  academyAddress: string;
  logoPath: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  const activeGroupLabel = React.useMemo(() => {
    for (const group of navigation) {
      if (group.href && isLinkActive(pathname, group.href)) return group.label;
      if (group.children?.some((c) => isLinkActive(pathname, c.href, c.exact))) return group.label;
    }
    return null;
  }, [navigation, pathname]);

  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set(activeGroupLabel ? [activeGroupLabel] : []),
  );

  // Keep the group containing the current route open as the user navigates.
  React.useEffect(() => {
    if (activeGroupLabel) {
      setExpanded((prev) => (prev.has(activeGroupLabel) ? prev : new Set(prev).add(activeGroupLabel)));
    }
  }, [activeGroupLabel]);

  const toggle = (label: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  return (
    <>
      {open && (
        <div
          className="no-print fixed inset-0 z-40 bg-navy-950/50 backdrop-blur-[1px] lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'no-print fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col bg-navy-gradient text-white transition-transform duration-200 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Brand */}
        <div className="flex items-start gap-3 border-b border-white/10 px-4 py-4">
          {logoPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoPath} alt="" className="h-11 w-11 shrink-0 rounded object-contain" />
          ) : (
            <Crest className="h-11 w-auto shrink-0" monogram={academyShortName} />
          )}
          <div className="min-w-0 flex-1">
            <p className="doc-title text-[13px] font-bold uppercase leading-tight tracking-wide text-white">
              {academyName}
            </p>
            <p className="mt-0.5 truncate text-[10.5px] text-navy-200">{academyAddress}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-navy-200 transition hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Links */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-3" aria-label="Main navigation">
          <ul className="space-y-0.5">
            {navigation.map((group) => {
              const groupActive = activeGroupLabel === group.label;

              if (!group.children?.length) {
                const active = group.href ? isLinkActive(pathname, group.href) : false;
                return (
                  <li key={group.label}>
                    <Link
                      href={group.href ?? '#'}
                      onClick={onClose}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13.5px] font-semibold transition',
                        active
                          ? 'bg-white/[0.14] text-white shadow-inner ring-1 ring-white/10'
                          : 'text-navy-100 hover:bg-white/[0.08] hover:text-white',
                      )}
                    >
                      <Icon name={group.icon} className="h-[18px] w-[18px] shrink-0" />
                      <span className="truncate">{group.label}</span>
                      {active && <span className="ml-auto h-4 w-1 rounded-full bg-gold-400" />}
                    </Link>
                  </li>
                );
              }

              const isOpen = expanded.has(group.label);
              return (
                <li key={group.label}>
                  <button
                    type="button"
                    onClick={() => toggle(group.label)}
                    aria-expanded={isOpen}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13.5px] font-semibold transition',
                      groupActive
                        ? 'bg-white/[0.14] text-white ring-1 ring-white/10'
                        : 'text-navy-100 hover:bg-white/[0.08] hover:text-white',
                    )}
                  >
                    <Icon name={group.icon} className="h-[18px] w-[18px] shrink-0" />
                    <span className="truncate">{group.label}</span>
                    <ChevronDown
                      className={cn(
                        'ml-auto h-4 w-4 shrink-0 transition-transform',
                        isOpen && 'rotate-180',
                      )}
                    />
                  </button>

                  {isOpen && (
                    <ul className="ml-[19px] mt-0.5 space-y-0.5 border-l border-white/15 pl-3">
                      {group.children.map((link) => {
                        const active = isLinkActive(pathname, link.href, link.exact);
                        return (
                          <li key={link.href}>
                            <Link
                              href={link.href}
                              onClick={onClose}
                              className={cn(
                                'block rounded-md px-2.5 py-[7px] text-[12.5px] transition',
                                active
                                  ? 'bg-gold-500/20 font-bold text-gold-200'
                                  : 'text-navy-200 hover:bg-white/[0.07] hover:text-white',
                              )}
                            >
                              {link.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-white/10 px-4 py-3 text-[10.5px] leading-relaxed text-navy-300">
          <p className="font-semibold uppercase tracking-wide text-navy-200">
            Academic &amp; Examination
          </p>
          <p>Management System v1.0</p>
        </div>
      </aside>
    </>
  );
}
