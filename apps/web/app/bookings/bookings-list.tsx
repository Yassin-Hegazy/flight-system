'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { FormAlert } from '@/components/auth-card';
import { PINK_LINK, StatusPill } from '@/components/page-parts';
import { errorMessage } from '@/lib/api';
import { useSignInRedirect } from '@/lib/auth';
import { dayOf, formatMoney, timeOf } from '@/lib/format';
import { type BookingSummary, listBookings, statusLabel } from '@/lib/trips-api';

/** My bookings, split into upcoming and past as the API splits them (US-BK-06). */
export function BookingsList() {
  const bookings = useQuery({ queryKey: ['bookings'], queryFn: listBookings, retry: false });
  const signedOut = useSignInRedirect(bookings.error);

  if (bookings.isPending || signedOut) return <p role="status">Loading your trips…</p>;
  if (bookings.isError) return <FormAlert message={errorMessage(bookings.error)} />;
  const { upcoming, past } = bookings.data;

  if (upcoming.length + past.length === 0) {
    return (
      <div className="flex flex-col items-start gap-5 rounded-[22px] bg-card p-7">
        <p className="text-lg font-bold">You have no trips yet.</p>
        <Link href="/search" className={PINK_LINK}>
          Search flights <span aria-hidden="true">↗</span>
        </Link>
      </div>
    );
  }
  return (
    <>
      <Group title="Upcoming" items={upcoming} empty="Nothing coming up." />
      <Group title="Past" items={past} empty="No past trips." />
    </>
  );
}

function Group({ title, items, empty }: { title: string; items: BookingSummary[]; empty: string }) {
  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <h2 className="text-2xl font-extrabold">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm font-medium text-navy-soft">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={item.reference}
              className="grid gap-4 rounded-[18px] bg-card p-5 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div className="flex flex-col gap-2">
                <p className="flex flex-wrap items-center gap-3">
                  <span className="text-2xl leading-none font-extrabold">
                    {item.route.origin} <span aria-hidden="true">→</span>
                    <span className="sr-only">to</span> {item.route.destination}
                  </span>
                  <StatusPill label={statusLabel(item.status)} />
                </p>
                <p className="text-sm font-medium text-navy-soft">
                  {dayOf(item.departureLocal)} · departs {timeOf(item.departureLocal)} · booking{' '}
                  {item.reference}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4 sm:justify-end">
                <p className="text-xl font-extrabold">{formatMoney(item.total)}</p>
                <Link
                  href={`/bookings/${item.reference}`}
                  aria-label={`View booking ${item.reference}`}
                  className="inline-flex h-11 items-center rounded-full bg-pink px-5 text-xs font-bold text-navy hover:brightness-105 focus-visible:outline-navy"
                >
                  VIEW
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
