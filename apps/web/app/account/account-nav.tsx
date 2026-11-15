'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { useMe } from '@/lib/auth';

const LINKS = [
  { href: '/account', label: 'Account settings' },
  { href: '/account/travelers', label: 'Saved travelers' },
  { href: '/bookings', label: 'My bookings' },
  { href: '/account/notifications', label: 'Notifications' },
];

export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Account" className="rounded-[22px] bg-navy p-4 lg:min-h-[420px]">
      <p className="px-2 pt-2 pb-4 text-[11px] leading-none font-bold text-mist">
        AERON / YOUR SPACE
      </p>
      <ul className="flex flex-wrap gap-2 border-t border-navy-soft pt-4 lg:flex-col">
        {LINKS.map(({ href, label }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={pathname === href ? 'page' : undefined}
              className="flex h-[45px] items-center rounded-[12px] px-4 text-sm font-bold text-white hover:bg-white/5 focus-visible:outline-teal aria-[current=page]:bg-pink aria-[current=page]:text-navy"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The account pages are for a signed-in traveler; anyone else is sent to sign in and back. */
export function AccountGate({ children }: { children: ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (me === null) router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
  }, [me, pathname, router]);
  // The page is always rendered, only hidden until the account is known, so Next can still
  // check the segment for instant navigation.
  return (
    <>
      {!me && <p role="status">Loading your account…</p>}
      <div className={me ? 'contents' : 'hidden'}>{children}</div>
    </>
  );
}
