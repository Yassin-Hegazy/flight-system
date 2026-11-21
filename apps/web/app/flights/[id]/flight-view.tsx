'use client';

import { useQuery } from '@tanstack/react-query';
import { Plane } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { errorMessage } from '@/lib/api';
import { type Flight, getFlight, STATUS_LABEL } from '@/lib/flights-api';
import { dayOf, formatDuration, formatMoney, timeOf } from '@/lib/format';
import { cn } from '@/lib/utils';
import { BUTTON_PRIMARY, BUTTON_SECONDARY, SIZE_LG } from '@/components/ui';

const CABINS = [
  ['ECONOMY', 'Economy'],
  ['BUSINESS', 'Business'],
] as const;

const BACK = `${BUTTON_SECONDARY} ${SIZE_LG}`;
const CONTINUE = `${BUTTON_PRIMARY} ${SIZE_LG}`;

/** Flight details (US-FL-01) and current status (US-FL-02), drawn as a boarding pass. */
export function FlightView() {
  const { id } = useParams<{ id: string }>();
  const flight = useQuery({ queryKey: ['flight', id], queryFn: () => getFlight(id), retry: false });

  if (flight.isPending) return <p role="status">Loading the flight…</p>;
  if (flight.isError) {
    return (
      <div className="flex flex-col items-start gap-6">
        <p role="alert" className="rounded-inset bg-ice p-5 text-lg font-bold text-danger">
          {errorMessage(flight.error)}
        </p>
        <Link href="/search" className={BACK}>
          <span aria-hidden="true">←</span> Back to search
        </Link>
      </div>
    );
  }
  return <Ticket flight={flight.data} />;
}

const BOOKABLE = new Set(['SCHEDULED', 'DELAYED']);

function Ticket({ flight }: { flight: Flight }) {
  // The party and cabin chosen in the search, if the traveler came from there.
  const party = useSearchParams().toString();
  const delayed = flight.estimatedDepartureLocal !== undefined;
  const cancelled = flight.status === 'CANCELLED';
  const departure = flight.estimatedDepartureLocal ?? flight.scheduledDepartureLocal;

  return (
    <>
      <div className="flex flex-col gap-4">
        <p className="text-xs leading-none font-bold text-navy-soft">
          FLIGHT {flight.flightNumber} / {flight.airline.name.toUpperCase()}
        </p>
        <h1 className="text-[clamp(2.5rem,5vw,64px)] leading-none font-extrabold">
          {flight.origin.city} to {flight.destination.city}
        </h1>
      </div>

      <section
        aria-label={`Flight ${flight.flightNumber}`}
        className="overflow-hidden rounded-card bg-navy p-4 sm:p-7"
      >
        <div className="overflow-hidden rounded-inset bg-teal">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-5 py-4 sm:px-7">
            <p className="text-2xl leading-none font-extrabold text-navy sm:text-[32px]">
              {flight.airline.name}
            </p>
            {/* The status is always spelled out; colour only reinforces it. */}
            <p className="flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-xs font-bold text-white">
              <span className="sr-only">Status:</span>
              <span data-testid="flight-status">{STATUS_LABEL[flight.status]}</span>
            </p>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 pt-7 sm:px-7">
            <Place code={flight.origin.code} city={flight.origin.city} name={flight.origin.name} />
            <Plane aria-hidden="true" className="size-8 rotate-45 text-navy-soft sm:size-11" />
            <Place
              code={flight.destination.code}
              city={flight.destination.city}
              name={flight.destination.name}
              end
            />
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 px-5 py-7 sm:grid-cols-5 sm:px-7">
            <Detail label="Flight">{flight.flightNumber}</Detail>
            <Detail label="Date">{dayOf(departure)}</Detail>
            <Detail label="Departs">
              <time dateTime={departure} data-testid="departs">
                {timeOf(departure)}
              </time>
              {delayed && (
                <span
                  data-testid="departs-scheduled"
                  className="block text-xs font-semibold text-navy-soft"
                >
                  Scheduled {timeOf(flight.scheduledDepartureLocal)}
                </span>
              )}
            </Detail>
            <Detail label={delayed ? 'Arrives (scheduled)' : 'Arrives'}>
              <time dateTime={flight.scheduledArrivalLocal} data-testid="arrives">
                {timeOf(flight.scheduledArrivalLocal)}
              </time>
            </Detail>
            <Detail label="Duration">{formatDuration(flight.durationMinutes)}</Detail>
          </dl>
        </div>

        <dl className="grid gap-x-10 gap-y-4 px-2 pt-6 sm:grid-cols-2 sm:px-5">
          {CABINS.map(([cabin, label]) => {
            const fare = flight.fares[cabin];
            return (
              <div key={cabin} className="flex items-baseline justify-between gap-4">
                <dt className="text-xs font-bold text-mist uppercase">{label} / per adult</dt>
                <dd
                  data-testid={`fare-${cabin}`}
                  className={cn('text-2xl font-extrabold', fare ? 'text-white' : 'text-mist')}
                >
                  {fare ? formatMoney(fare) : 'Not offered'}
                </dd>
              </div>
            );
          })}
        </dl>
        <p className="px-2 pt-5 text-xs font-medium text-mist sm:px-5">
          Times are local to each airport.
          {delayed && ' The arrival time may change with the delay.'}
        </p>
      </section>

      {cancelled && (
        <p className="rounded-inset bg-ice p-5 text-lg font-bold text-danger">
          This flight was cancelled and cannot be booked.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {BOOKABLE.has(flight.status) && (
          <Link
            href={`/book?flightId=${flight.id}${party ? `&${party}` : ''}`}
            className={CONTINUE}
          >
            Continue to booking <span aria-hidden="true">↗</span>
          </Link>
        )}
        <Link
          href={`/search?origin=${flight.origin.code}&destination=${flight.destination.code}&date=${flight.scheduledDepartureLocal.slice(0, 10)}`}
          className={BACK}
        >
          <span aria-hidden="true">←</span> Back to results
        </Link>
      </div>
    </>
  );
}

function Place({
  code,
  city,
  name,
  end,
}: {
  code: string;
  city: string;
  name: string;
  end?: boolean;
}) {
  return (
    <div className={cn('min-w-0', end && 'text-right')}>
      <p className="text-[clamp(2.25rem,8vw,64px)] leading-none font-extrabold">{code}</p>
      <p className="mt-2 text-xs font-bold text-navy-soft uppercase">{city}</p>
      <p className="mt-1 hidden text-xs font-medium text-navy-soft sm:block">{name}</p>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] leading-none font-bold text-navy-soft uppercase">{label}</dt>
      <dd className="mt-2 text-xl leading-tight font-extrabold">{children}</dd>
    </div>
  );
}
