'use client';

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormAlert } from '@/components/auth-card';
import { StatusPill } from '@/components/page-parts';
import {
  CABIN_LABEL,
  type CabinLoad,
  CABINS,
  CANCELLABLE,
  getLoad,
  getManifest,
  type ManifestEntry,
  NEXT_STATUSES,
} from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { type Flight, getFlight, STATUS_LABEL } from '@/lib/flights-api';
import { dayOf, timeOf } from '@/lib/format';
import { AdminTable, ADMIN_CARD, CardHeading, QUIET_BUTTON } from '../../admin-parts';
import { CabinForm, CancelForm, StatusForm } from './flight-forms';

/** One flight for an administrator: what it is, how full, who is on it, and what can change. */
export function FlightOps() {
  const { id } = useParams<{ id: string }>();
  const flight = useQuery({
    queryKey: ['admin-flight', id],
    queryFn: () => getFlight(id),
    retry: false,
  });
  const load = useQuery({ queryKey: ['admin-load', id], queryFn: () => getLoad(id), retry: false });
  const manifest = useQuery({
    queryKey: ['admin-manifest', id],
    queryFn: () => getManifest(id),
    retry: false,
  });

  if (flight.isPending) return <p role="status">Loading the flight…</p>;
  if (!flight.data) {
    return (
      <>
        <FormAlert message={errorMessage(flight.error)} />
        <div>
          <Link href="/admin/flights" className={QUIET_BUTTON}>
            Back to flights
          </Link>
        </div>
      </>
    );
  }
  const f = flight.data;
  const canMove = NEXT_STATUSES[f.status].length > 0;
  const canCancel = CANCELLABLE.includes(f.status);

  return (
    <>
      <FlightHeader flight={f} />
      <LoadSection load={load} />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        {CABINS.map((cabin) => (
          <CabinForm
            key={cabin}
            flightId={f.id}
            cabin={cabin}
            capacity={load.data?.find((entry) => entry.cabin === cabin)?.capacity}
            fare={f.fares[cabin]}
          />
        ))}
      </div>
      {(canMove || canCancel) && (
        <div className="grid items-start gap-6 xl:grid-cols-2">
          {canMove && <StatusForm flight={f} />}
          {canCancel && <CancelForm flight={f} />}
        </div>
      )}
      {f.status === 'CANCELLED' && (
        <p className={`${ADMIN_CARD} font-semibold`}>
          This flight is cancelled; its bookings were cancelled and refunded. Nothing more can
          change.
        </p>
      )}
      <ManifestSection manifest={manifest} />
    </>
  );
}

function FlightHeader({ flight: f }: { flight: Flight }) {
  const departs = f.estimatedDepartureLocal ?? f.scheduledDepartureLocal;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-none font-bold text-navy-soft uppercase">
        Administration · {f.airline.name}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-[clamp(2.25rem,5vw,56px)] leading-none font-extrabold">
          {f.flightNumber} · {f.origin.code} → {f.destination.code}
        </h1>
        <StatusPill label={STATUS_LABEL[f.status]} testId="flight-status" />
      </div>
      <p className="text-[17px] font-medium text-navy-soft">
        {f.origin.city} to {f.destination.city} · {dayOf(departs)} · departs {timeOf(departs)} local
        {f.estimatedDepartureLocal && ` (scheduled ${timeOf(f.scheduledDepartureLocal)})`} · arrives{' '}
        {timeOf(f.scheduledArrivalLocal)} local
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/admin/flights" className={QUIET_BUTTON}>
          Back to flights
        </Link>
        <Link href={`/admin/audit?flightId=${f.id}`} className={QUIET_BUTTON}>
          Audit trail for this flight
        </Link>
      </div>
    </div>
  );
}

function LoadSection({ load }: { load: UseQueryResult<CabinLoad[]> }) {
  return (
    <section aria-labelledby="load-title" className="flex flex-col gap-4">
      <h2 id="load-title" className="text-2xl font-extrabold">
        Seats
      </h2>
      <FormAlert message={load.isError ? errorMessage(load.error) : null} />
      {load.data && (
        <AdminTable name="Seats by cabin" head={['Cabin', 'Capacity', 'Sold', 'Held', 'Available']}>
          {load.data.map((cabin) => (
            <tr key={cabin.cabin}>
              <th scope="row" className="px-4 py-3 font-bold">
                {CABIN_LABEL[cabin.cabin]}
              </th>
              <td>{cabin.capacity}</td>
              <td>{cabin.committedSeats}</td>
              <td>{cabin.activeHeldSeats}</td>
              <td className="font-bold">{cabin.availableSeats}</td>
            </tr>
          ))}
        </AdminTable>
      )}
    </section>
  );
}

function ManifestSection({ manifest }: { manifest: UseQueryResult<ManifestEntry[]> }) {
  return (
    <section aria-labelledby="manifest-title" className="flex flex-col gap-4">
      <CardHeading kicker="Paid passengers" title="Manifest" id="manifest-title" />
      <FormAlert message={manifest.isError ? errorMessage(manifest.error) : null} />
      {manifest.data?.length === 0 && (
        <p className="rounded-[18px] bg-card p-5 font-semibold">No confirmed passengers yet.</p>
      )}
      {!!manifest.data?.length && (
        <AdminTable name="Passenger manifest" head={['Passenger', 'Booking', 'Ticket', 'Status']}>
          {manifest.data.map((entry) => (
            <tr key={`${entry.bookingReference}-${entry.passengerName}`}>
              <td className="font-bold">{entry.passengerName}</td>
              <td>{entry.bookingReference}</td>
              <td>{entry.ticketNumber ?? '—'}</td>
              <td>{entry.status}</td>
            </tr>
          ))}
        </AdminTable>
      )}
    </section>
  );
}
