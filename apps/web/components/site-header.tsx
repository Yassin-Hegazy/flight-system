'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useMe, useSignOut } from '@/lib/auth';
import { cn } from '@/lib/utils';

// Only screens that exist are linked; account and trips links join as their screens are built.
const LINKS = [
  { href: '/', label: 'EXPLORE' },
  { href: '/search', label: 'FLIGHTS' },
  { href: '/#destinations', label: 'DESTINATIONS' },
  { href: '/#why', label: 'WHY AERON' },
];

export function Brand() {
  return (
    <span className="flex items-center">
      <span aria-hidden="true" className="mr-2 flex gap-[5px]">
        <span className="size-3 rounded-full bg-pink" />
        <span className="size-3 rounded-full bg-navy" />
        <span className="size-3 rounded-full bg-white" />
      </span>
      <span className="text-[30px] leading-none font-extrabold text-navy sm:text-[34px]">
        aeron.
      </span>
      <span className="ml-7 hidden text-[10px] leading-none font-bold text-navy-soft min-[1400px]:inline">
        FLY MORE. WORRY LESS.
      </span>
    </span>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const me = useMe();
  const signOut = useSignOut();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      menuButton.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const current = (href: string) => (href === pathname ? ('page' as const) : undefined);

  return (
    <header className="relative z-30 print:hidden mx-auto w-full max-w-[1440px] px-5 md:px-10 xl:px-[72px]">
      <div className="flex h-[88px] items-center justify-between gap-6 xl:h-[106px]">
        <Link href="/" aria-label="aeron home" className="rounded-lg">
          <Brand />
        </Link>

        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-[7px] rounded-full bg-navy px-3 py-[11px]">
            {LINKS.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={current(href)}
                  className="flex h-11 items-center rounded-full px-5 text-xs font-bold text-teal transition-colors hover:text-white focus-visible:outline-teal aria-[current=page]:bg-pink aria-[current=page]:text-navy"
                >
                  {label}
                </Link>
              </li>
            ))}
            {me ? (
              <>
                <li>
                  <Link
                    href="/bookings"
                    aria-current={current('/bookings')}
                    className="flex h-11 items-center rounded-full px-5 text-xs font-bold text-teal transition-colors hover:text-white focus-visible:outline-teal aria-[current=page]:bg-pink aria-[current=page]:text-navy"
                  >
                    MY TRIPS
                  </Link>
                </li>
                <li className="max-w-[140px] truncate px-3 text-xs font-bold text-white">
                  {me.name}
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => signOut.mutate()}
                    className="flex h-11 cursor-pointer items-center rounded-full bg-teal px-6 text-xs font-bold text-navy transition-colors hover:bg-white"
                  >
                    SIGN OUT
                  </button>
                </li>
              </>
            ) : (
              <li>
                <Link
                  href="/sign-in"
                  className="flex h-11 items-center gap-2 rounded-full bg-teal px-7 text-xs font-bold text-navy transition-colors hover:bg-white"
                >
                  SIGN IN
                  <span aria-hidden="true">↗</span>
                </Link>
              </li>
            )}
          </ul>
        </nav>

        <button
          ref={menuButton}
          type="button"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((value) => !value)}
          className="flex h-12 cursor-pointer items-center rounded-full bg-navy px-5 text-xs font-bold text-teal lg:hidden"
        >
          {open ? 'CLOSE' : 'MENU'}
        </button>
      </div>

      <div aria-hidden="true" className="relative h-px bg-mist">
        <span className="absolute top-[-1px] left-[58%] hidden h-[3px] w-[216px] rounded-sm bg-pink lg:block" />
      </div>

      {open && (
        <nav
          id="mobile-nav"
          aria-label="Primary"
          className="absolute inset-x-5 top-[80px] rounded-3xl bg-navy p-3 shadow-[0_24px_60px_-20px_rgb(7_45_80/0.6)] md:inset-x-10 lg:hidden"
        >
          <ul className="flex flex-col gap-1">
            {[
              ...LINKS,
              ...(me
                ? [{ href: '/bookings', label: 'MY TRIPS' }]
                : [{ href: '/sign-in', label: 'SIGN IN' }]),
            ].map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={current(href)}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex h-12 items-center rounded-2xl px-4 text-sm font-bold text-teal hover:bg-white/5',
                    'aria-[current=page]:bg-pink aria-[current=page]:text-navy',
                  )}
                >
                  {label}
                </Link>
              </li>
            ))}
            {me && (
              <li className="flex items-center justify-between gap-3 px-4 pt-2">
                <span className="truncate text-sm font-bold text-white">{me.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    signOut.mutate();
                  }}
                  className="h-11 cursor-pointer rounded-full bg-teal px-5 text-xs font-bold text-navy"
                >
                  SIGN OUT
                </button>
              </li>
            )}
          </ul>
        </nav>
      )}
    </header>
  );
}
