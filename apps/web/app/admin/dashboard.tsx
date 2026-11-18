'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { FormAlert } from '@/components/auth-card';
import { StatusPill } from '@/components/page-parts';
import {
  actionLabel,
  changeLines,
  type FlightFilter,
  listAudit,
  listFlights,
  utcDay,
} from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { STATUS_LABEL } from '@/lib/flights-api';
import { dayOf, formatInstant, timeOf } from '@/lib/format';
import {
  AdminTable,
  CardHeading,
  NAVY_BUTTON,
  PINK_BUTTON,
  QUIET_BUTTON,
  Stat,
} from './admin-parts';

const UPCOMING = 6;
const RECENT = 5;

/** How many flights match, read from the total of a one-row page. */
function useCount(key: string, filter: FlightFilter) {
  return useQuery({
    queryKey: ['admin-count', key, filter],
    queryFn: () => listFlights(filter).then((page) => page.total),
  });
}

/** Today's numbers, what departs next and the latest changes (US-AD-05, US-AD-07). */
export function Dashboard() {
  // Read once, so the windows stay put while the page is open.
  const [now] = useState(() => new Date());
  const today = utcDay(now.toISOString().slice(0, 10));
  const departing = useCount('today', today);
  const delayed = useCount('delayed', { ...today, status: 'DELAYED' });
  const cancelled = useCount('cancelled', { ...today, status: 'CANCELLED' });
  const next = useQuery({
    queryKey: ['admin-next', now.toISOString()],
    queryFn: () => listFlights({ departingFrom: now.toISOString() }),
  });
  const recent = useQuery({
    queryKey: ['admin-audit', undefined, 1],
    queryFn: () => listAudit(undefined, 1),
  });
  const failure = [departing, delayed, cancelled, next, recent].find((query) => query.isError);

  return (
    <>
      <FormAlert message={failure ? errorMessage(failure.error) : null} />
      <section aria-label="Today (UTC)" className="grid gap-4 sm:grid-cols-3">
        <Stat label="Departing today (UTC)" value={departing.data ?? '…'} testId="stat-today" />
        <Stat label="Delayed today" value={delayed.data ?? '…'} testId="stat-delayed" />
        <Stat label="Cancelled today" value={cancelled.data ?? '…'} testId="stat-cancelled" />
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href="/admin/flights/new" className={PINK_BUTTON}>
          Create a flight <span aria-hidden="true">↗</span>
        </Link>
        <Link href="/admin/airports" className={QUIET_BUTTON}>
          Add an airport
        </Link>
        <Link href="/admin/admins" className={QUIET_BUTTON}>
          Create an administrator
        </Link>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="next-title" className="flex min-w-0 flex-col gap-4">
          <CardHeading kicker="From now" title="Next departures" id="next-title" />
          {next.data &&
            (next.data.items.length === 0 ? (
              <p className="rounded-[18px] bg-card p-5 font-semibold">Nothing scheduled ahead.</p>
            ) : (
              <AdminTable
                name="Next departures"
                head={['Flight', 'Route', 'Departs (local)', 'Status', '']}
              >
                {next.data.items.slice(0, UPCOMING).map((flight) => (
                  <tr key={flight.id}>
                    <td className="font-extrabold">{flight.flightNumber}</td>
                    <td className="font-bold">
                      {flight.origin.code} <span aria-hidden="true">→</span>
                      <span className="sr-only">to</span> {flight.destination.code}
                    </td>
                    <td className="whitespace-nowrap">
                      {dayOf(flight.scheduledDepartureLocal)} ·{' '}
                      {timeOf(flight.scheduledDepartureLocal)}
                    </td>
                    <td>
                      <StatusPill label={STATUS_LABEL[flight.status]} />
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/admin/flights/${flight.id}`}
                        aria-label={`Manage ${flight.flightNumber}`}
                        className={NAVY_BUTTON}
                      >
                        MANAGE
                      </Link>
                    </td>
                  </tr>
                ))}
              </AdminTable>
            ))}
          <Link href="/admin/flights" className="self-start text-sm font-bold underline">
            All flights
          </Link>
        </section>

        <section
          aria-labelledby="recent-title"
          className="flex flex-col gap-5 rounded-[22px] bg-navy p-5 text-white sm:p-6"
        >
          <span aria-hidden="true" className="block h-[5px] w-[62px] rounded bg-pink" />
          <div>
            <p className="text-[11px] leading-none font-bold text-mist uppercase">Audit trail</p>
            <h2 id="recent-title" className="mt-3 text-2xl font-extrabold">
              Recent changes
            </h2>
          </div>
          {recent.data &&
            (recent.data.length === 0 ? (
              <p className="text-sm text-mist">No changes yet.</p>
            ) : (
              <ul aria-label="Recent changes" className="flex flex-col gap-4">
                {recent.data.slice(0, RECENT).map((entry) => (
                  <li key={entry.id} className="border-t border-navy-soft pt-3">
                    <p className="text-sm font-bold">{actionLabel(entry.action)}</p>
                    <p className="font-mono text-xs break-all text-teal">
                      {changeLines(entry)[0] ?? entry.target}
                    </p>
                    <p className="text-xs text-mist">{formatInstant(entry.createdAt)}</p>
                  </li>
                ))}
              </ul>
            ))}
          <Link href="/admin/audit" className="self-start text-sm font-bold text-teal underline">
            The whole audit trail
          </Link>
        </section>
      </div>
    </>
  );
}
