'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';
import { Field, INPUT_CLASS } from '@/app/search/field';
import { FormAlert } from '@/components/auth-card';
import { StatusPill } from '@/components/page-parts';
import { type AdminFlight, type FlightFilter, listFlights, utcDay } from '@/lib/admin-api';
import { errorMessage, formText } from '@/lib/api';
import { type FlightStatus, STATUS_LABEL } from '@/lib/flights-api';
import { dayOf, timeOf } from '@/lib/format';
import {
  ADMIN_CARD,
  AdminTable,
  NAVY_BUTTON,
  Pager,
  PINK_BUTTON,
  QUIET_BUTTON,
} from '../admin-parts';

const FILTERS = ['origin', 'destination', 'flightNumber', 'status', 'date'] as const;

/** The URL is the filter, so a filtered list can be bookmarked and the back button works. */
function filterOf(params: URLSearchParams): FlightFilter {
  const date = params.get('date');
  return {
    origin: params.get('origin') ?? undefined,
    destination: params.get('destination') ?? undefined,
    flightNumber: params.get('flightNumber') ?? undefined,
    status: (params.get('status') as FlightStatus | null) ?? undefined,
    ...(date ? utcDay(date) : {}),
    page: Number(params.get('page') ?? '1') || 1,
  };
}

/** Every flight by departure, filtered and paged by the API (US-AD-05). */
export function FlightsView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filter = filterOf(params);
  const flights = useQuery({
    queryKey: ['admin-flights', params.toString()],
    queryFn: () => listFlights(filter),
  });

  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const name of FILTERS) {
      const value = formText(data, name).trim();
      if (value) next.set(name, name === 'date' || name === 'status' ? value : value.toUpperCase());
    }
    router.push(`${pathname}?${next.toString()}`);
  };

  const pageHref = (page: number) => {
    const next = new URLSearchParams(params);
    next.set('page', String(page));
    return `${pathname}?${next.toString()}`;
  };
  const data = flights.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <form
        key={params.toString()}
        onSubmit={apply}
        aria-label="Filter flights"
        className={`${ADMIN_CARD} grid gap-4 sm:grid-cols-2 xl:grid-cols-5`}
      >
        <Field id="ff-origin" label="From">
          {(control) => (
            <input
              {...control}
              name="origin"
              maxLength={3}
              placeholder="CAI"
              defaultValue={params.get('origin') ?? ''}
              className={`${INPUT_CLASS} uppercase`}
            />
          )}
        </Field>
        <Field id="ff-destination" label="To">
          {(control) => (
            <input
              {...control}
              name="destination"
              maxLength={3}
              placeholder="LHR"
              defaultValue={params.get('destination') ?? ''}
              className={`${INPUT_CLASS} uppercase`}
            />
          )}
        </Field>
        <Field id="ff-number" label="Flight number">
          {(control) => (
            <input
              {...control}
              name="flightNumber"
              maxLength={6}
              placeholder="MS777"
              defaultValue={params.get('flightNumber') ?? ''}
              className={`${INPUT_CLASS} uppercase`}
            />
          )}
        </Field>
        <Field id="ff-status" label="Status">
          {(control) => (
            <select
              {...control}
              name="status"
              defaultValue={params.get('status') ?? ''}
              className={INPUT_CLASS}
            >
              <option value="">Any status</option>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field id="ff-date" label="Departure date (UTC)">
          {(control) => (
            <input
              {...control}
              name="date"
              type="date"
              defaultValue={params.get('date') ?? ''}
              className={INPUT_CLASS}
            />
          )}
        </Field>
        <div className="flex flex-wrap gap-3 sm:col-span-2 xl:col-span-5">
          <button type="submit" className={PINK_BUTTON}>
            Apply filters
          </button>
          <Link href={pathname} className={QUIET_BUTTON}>
            Clear
          </Link>
        </div>
      </form>

      <FormAlert message={flights.isError ? errorMessage(flights.error) : null} />
      {flights.isPending && <p role="status">Loading flights…</p>}
      {data && (
        <section aria-label="Results" className="flex flex-col gap-4">
          <p className="text-sm font-bold">
            {data.total} {data.total === 1 ? 'flight' : 'flights'}
            {data.total > 0 && ` · page ${data.page} of ${pages}`}
          </p>
          {data.items.length === 0 ? (
            <p className="rounded-[18px] bg-card p-5 font-semibold">
              No flight matches these filters.
            </p>
          ) : (
            <AdminTable name="Flights" head={['Flight', 'Route', 'Departs (local)', 'Status', '']}>
              {data.items.map((flight) => (
                <FlightRow key={flight.id} flight={flight} />
              ))}
            </AdminTable>
          )}
          <Pager
            label={`Page ${data.page} of ${pages}`}
            previous={data.page > 1 ? pageHref(data.page - 1) : undefined}
            next={data.page < pages ? pageHref(data.page + 1) : undefined}
          />
        </section>
      )}
    </>
  );
}

function FlightRow({ flight }: { flight: AdminFlight }) {
  const departs = flight.scheduledDepartureLocal;
  return (
    <tr>
      <td>
        <p className="font-extrabold">{flight.flightNumber}</p>
        <p className="text-xs text-navy-soft">{flight.airline.name}</p>
      </td>
      <td>
        <p className="font-bold">
          {flight.origin.code} <span aria-hidden="true">→</span>
          <span className="sr-only">to</span> {flight.destination.code}
        </p>
        <p className="text-xs text-navy-soft">
          {flight.origin.city} to {flight.destination.city}
        </p>
      </td>
      <td className="whitespace-nowrap">
        {dayOf(departs)} · {timeOf(departs)}
      </td>
      <td>
        <StatusPill label={STATUS_LABEL[flight.status]} />
      </td>
      <td className="text-right">
        <Link
          href={`/admin/flights/${flight.id}`}
          aria-label={`Manage ${flight.flightNumber} on ${dayOf(departs)}`}
          className={NAVY_BUTTON}
        >
          MANAGE
        </Link>
      </td>
    </tr>
  );
}
