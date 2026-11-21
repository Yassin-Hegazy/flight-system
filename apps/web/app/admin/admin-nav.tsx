'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { PageHeading } from '@/components/page-parts';
import { useMe } from '@/lib/auth';

const LINKS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/flights', label: 'Flights' },
  { href: '/admin/airports', label: 'Airports' },
  { href: '/admin/audit', label: 'Audit trail' },
  { href: '/admin/admins', label: 'Admin users' },
];

/** A section is current on its own page and below it; the dashboard only on itself. */
const isCurrent = (href: string, pathname: string) =>
  href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Administration"
      className="flex flex-col rounded-card bg-navy p-4 lg:min-h-[640px]"
    >
      <p className="px-2 pt-2 pb-4 text-[11px] leading-none font-bold text-mist">
        AERON / OPERATIONS
      </p>
      <ul className="flex flex-wrap gap-2 border-t border-navy-soft pt-4 lg:flex-col">
        {LINKS.map(({ href, label }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={isCurrent(href, pathname) ? 'page' : undefined}
              className="flex h-[45px] items-center rounded-full px-4 text-sm font-semibold text-white hover:bg-white/5 focus-visible:outline-teal aria-[current=page]:bg-white aria-[current=page]:font-bold aria-[current=page]:text-navy"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-auto hidden border-t border-navy-soft px-2 pt-5 lg:block">
        <p className="text-xs font-bold text-white">Travel light. Stay ready.</p>
        <p className="mt-2 text-xs text-mist">
          A simpler place for everything behind your next journey.
        </p>
      </div>
    </nav>
  );
}

/**
 * The admin pages are for a signed-in administrator. Nobody signed in is sent to sign in and
 * back; a traveler is told the area is not theirs. The API checks the role again on every call.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (me === null) router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
  }, [me, pathname, router]);

  if (me && me.role !== 'ADMIN') {
    return (
      <>
        <PageHeading eyebrow="Administration" title="For administrators only" />
        <p className="max-w-[60ch] text-[17px] font-medium text-navy-soft">
          You are signed in as {me.name}, a traveler. This area is for aeron administrators.
        </p>
        <div>
          <Link
            href="/"
            className="inline-flex h-[52px] items-center rounded-full bg-navy px-6 text-[15px] font-bold text-white hover:bg-navy-soft"
          >
            Back to aeron
          </Link>
        </div>
      </>
    );
  }
  // Rendered but hidden until the account is known, so Next can still check the segment.
  return (
    <>
      {!me && <p role="status">Checking your access…</p>}
      <div className={me ? 'contents' : 'hidden'}>{children}</div>
    </>
  );
}
