'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { FormAlert } from '@/components/auth-card';
import { PINK_LINK, StatusPill } from '@/components/page-parts';
import { errorMessage } from '@/lib/api';
import { useSignInRedirect } from '@/lib/auth';
import { dayOf, formatMoney, timeOf } from '@/lib/format';
import { type BookingSummary, listBookings, statusLabel } from '@/lib/trips-api';

/** My bookings, split into upcoming and past as the API splits them (US-BK-06). */
export function BookingsList() {
  const [includeExpired, setIncludeExpired] = useState(false);
  const bookings = useQuery({
    queryKey: ['bookings', includeExpired],
    queryFn: () => listBookings(includeExpired),
    // Keep the list on screen while the other one loads, so ticking the box does not flash.
    placeholderData: (previous) => previous,
    retry: false,
  });
  const signedOut = useSignInRedirect(bookings.error);

  if (bookings.isPending || signedOut) return <p role="status">Loading your trips…</p>;
  if (bookings.isError) return <FormAlert message={errorMessage(bookings.error)} />;
  const { upcoming, past } = bookings.data;

  return (
    <>
      <label className="flex items-center gap-3 self-start text-sm font-bold">
        <input
          type="checkbox"
          checked={includeExpired}
          onChange={(event) => setIncludeExpired(event.target.checked)}
          className="size-4 accent-navy"
        />
        Show expired bookings
      </label>
      {upcoming.length + past.length === 0 ? (
        <div className="flex flex-col items-start gap-5 rounded-card border border-line bg-white p-7">
          <p className="text-lg font-bold">You have no trips yet.</p>
          <Link href="/search" className={PINK_LINK}>
            Search flights <span aria-hidden="true">↗</span>
          </Link>
        </div>
      ) : (
        <>
          <Group title="Upcoming" items={upcoming} empty="Nothing coming up." />
          <Group title="Past" items={past} empty="No past trips." />
        </>
      )}
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
              className="grid gap-4 rounded-card border border-line bg-white p-5 sm:grid-cols-[1fr_auto] sm:items-center"
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
                  className="inline-flex h-11 items-center rounded-full bg-navy px-5 text-[13px] font-bold text-white hover:bg-navy-soft"
                >
                  View
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
