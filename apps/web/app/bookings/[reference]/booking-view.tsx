'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { FormAlert } from '@/components/auth-card';
import { NAVY_LINK, PageHeading, Panel, PINK_LINK, StatusPill } from '@/components/page-parts';
import { errorMessage } from '@/lib/api';
import { useSignInRedirect } from '@/lib/auth';
import { getFlight } from '@/lib/flights-api';
import { dayOf, formatInstant, formatMoney, timeOf } from '@/lib/format';
import {
  type BookingDetail,
  CANCELLABLE,
  cancelBooking,
  getBookingDetail,
  getReceipt,
  listTickets,
  statusLabel,
} from '@/lib/trips-api';

/** One booking: status, flights, passengers, receipt, tickets and history (US-BK-04, US-BK-05). */
export function BookingView() {
  const { reference } = useParams<{ reference: string }>();
  const booking = useQuery({
    queryKey: ['booking', reference],
    queryFn: () => getBookingDetail(reference),
    retry: false,
  });
  const signedOut = useSignInRedirect(booking.error);

  if (booking.isPending || signedOut) return <p role="status">Loading your booking…</p>;
  if (booking.isError) {
    return (
      <>
        <FormAlert message={errorMessage(booking.error)} />
        <div>
          <Link href="/bookings" className={NAVY_LINK}>
            Back to my trips
          </Link>
        </div>
      </>
    );
  }
  const detail = booking.data;
  const paid = detail.status !== 'PENDING_PAYMENT';

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeading eyebrow="My trips" title={`Booking ${detail.reference}`} />
        <StatusPill label={statusLabel(detail.status)} testId="booking-status" />
      </div>
      <Actions booking={detail} />
      <Flights booking={detail} />
      <Panel title="Passengers">
        <ul className="flex flex-col gap-2 text-sm font-medium">
          {detail.passengers.map((passenger, index) => (
            <li key={index} className="flex justify-between gap-4">
              <span>
                {passenger.firstName} {passenger.lastName} · {passenger.type.toLowerCase()}
              </span>
              <span>{formatMoney(passenger.fare)}</span>
            </li>
          ))}
        </ul>
        <p className="flex items-baseline justify-between gap-4 border-t border-line pt-4">
          <span className="text-xs font-bold text-navy-soft">TOTAL</span>
          <span data-testid="booking-total" className="text-2xl font-extrabold">
            {formatMoney(detail.amount)}
          </span>
        </p>
      </Panel>
      {paid && <ReceiptPanel reference={detail.reference} />}
      {paid && <TicketsPanel reference={detail.reference} />}
      <Panel title="History">
        <ol className="flex flex-col gap-2 text-sm font-medium">
          {detail.history.map((change) => (
            <li key={change.at} className="flex flex-wrap justify-between gap-x-4">
              <span>{statusLabel(change.to)}</span>
              <time dateTime={change.at} className="text-navy-soft">
                {formatInstant(change.at)}
              </time>
            </li>
          ))}
        </ol>
      </Panel>
    </>
  );
}

/** Pay an unpaid booking, or cancel one. Cancelling asks first, on the page, before it is sent. */
function Actions({ booking }: { booking: BookingDetail }) {
  const client = useQueryClient();
  const [asking, setAsking] = useState(false);
  const cancel = useMutation({
    mutationFn: () => cancelBooking(booking.reference),
    onSuccess: (cancelled) => {
      client.setQueryData(['booking', booking.reference], cancelled);
      setAsking(false);
      // The refund, the void tickets and the list all follow from the cancellation.
      for (const key of ['receipt', 'tickets']) {
        void client.invalidateQueries({ queryKey: [key, booking.reference] });
      }
      void client.invalidateQueries({ queryKey: ['bookings'] });
    },
  });

  if (!CANCELLABLE.has(booking.status)) return null;
  return (
    <div className="flex flex-col gap-4">
      <FormAlert message={cancel.isError ? errorMessage(cancel.error) : null} />
      <div className="flex flex-wrap gap-3">
        {booking.status === 'PENDING_PAYMENT' && (
          <Link href={`/bookings/${booking.reference}/pay`} className={PINK_LINK}>
            Pay now
          </Link>
        )}
        {!asking && (
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="h-[52px] cursor-pointer rounded-full border border-navy/25 px-6 text-[15px] font-bold hover:border-navy"
          >
            Cancel booking
          </button>
        )}
      </div>
      {asking && (
        <div className="flex flex-col gap-4 rounded-[18px] border-2 border-danger bg-card p-5">
          <p className="text-base font-bold">
            Cancel booking {booking.reference}? Its tickets become void, and anything you paid is
            refunded to the card.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending}
              className="h-[52px] cursor-pointer rounded-full bg-danger px-6 text-[15px] font-bold text-white disabled:opacity-60"
            >
              {cancel.isPending ? 'Cancelling…' : 'Yes, cancel this booking'}
            </button>
            <button
              type="button"
              onClick={() => setAsking(false)}
              className="h-[52px] cursor-pointer rounded-full border border-navy/25 px-6 text-[15px] font-bold hover:border-navy"
            >
              Keep it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Flights({ booking }: { booking: BookingDetail }) {
  const flights = useQueries({
    queries: booking.segments.map((segment) => ({
      queryKey: ['flight', segment.flightId],
      queryFn: () => getFlight(segment.flightId),
      retry: false,
    })),
  });
  return (
    <Panel title="Flights">
      <ul className="flex flex-col gap-4">
        {flights.map(({ data: flight }, index) =>
          flight ? (
            <li key={flight.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-2xl leading-tight font-extrabold">
                  {flight.origin.code} <span aria-hidden="true">→</span>
                  <span className="sr-only">to</span> {flight.destination.code}
                </p>
                <p className="text-sm font-medium text-navy-soft">
                  {flight.flightNumber} · {flight.airline.name} ·{' '}
                  {dayOf(flight.scheduledDepartureLocal)} · {timeOf(flight.scheduledDepartureLocal)}{' '}
                  to {timeOf(flight.scheduledArrivalLocal)} ·{' '}
                  {booking.cabin === 'ECONOMY' ? 'Economy' : 'Business'}
                </p>
              </div>
              <Link
                href={`/flights/${flight.id}`}
                aria-label={`Flight status for ${flight.flightNumber}`}
                className="inline-flex h-11 items-center rounded-full border border-navy/25 px-5 text-xs font-bold hover:border-navy"
              >
                FLIGHT STATUS
              </Link>
            </li>
          ) : (
            <li key={index} role="status" className="text-sm font-medium text-navy-soft">
              Loading the flight…
            </li>
          ),
        )}
      </ul>
    </Panel>
  );
}

/** What was paid, with which card, and the refund if there is one (US-PAY-05). */
function ReceiptPanel({ reference }: { reference: string }) {
  const receipt = useQuery({
    queryKey: ['receipt', reference],
    queryFn: () => getReceipt(reference),
    retry: false,
  });
  // No payment was ever made (cancelled before paying): there is nothing to show.
  if (!receipt.data) return null;
  const { amount, card, createdAt, refund } = receipt.data;
  return (
    <Panel title="Receipt">
      <p className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span className="text-sm font-medium">
          Paid {formatInstant(createdAt)}
          {card && ` · ${card.brand} ending ${card.last4}`}
        </span>
        <span data-testid="paid-amount" className="text-2xl font-extrabold">
          {formatMoney(amount)}
        </span>
      </p>
      {refund && (
        <p className="flex flex-wrap items-baseline justify-between gap-x-4 border-t border-line pt-4">
          <span className="text-sm font-medium">
            {refund.status === 'SUCCEEDED' ? 'Refunded' : `Refund ${refund.status.toLowerCase()}`}
            {refund.resolvedAt && ` ${formatInstant(refund.resolvedAt)}`}
          </span>
          <span data-testid="refund-amount" className="text-2xl font-extrabold">
            {formatMoney(refund.amount)}
          </span>
        </p>
      )}
    </Panel>
  );
}

function TicketsPanel({ reference }: { reference: string }) {
  const tickets = useQuery({
    queryKey: ['tickets', reference],
    queryFn: () => listTickets(reference),
    retry: false,
  });
  if (!tickets.data?.length) return null;
  return (
    <Panel title="Tickets">
      <ul className="flex flex-col gap-3">
        {tickets.data.map((ticket) => (
          <li
            key={ticket.ticketNumber}
            className="flex flex-wrap items-center justify-between gap-3 text-sm font-medium"
          >
            <span>
              <span className="font-bold">{ticket.passengerName}</span> ·{' '}
              {ticket.flight.flightNumber} {ticket.flight.origin.code} to{' '}
              {ticket.flight.destination.code} · ticket {ticket.ticketNumber}
            </span>
            <span className="flex items-center gap-3">
              <StatusPill label={statusLabel(ticket.status)} />
              <Link
                href={`/tickets/${ticket.ticketNumber}`}
                aria-label={`Open ticket ${ticket.ticketNumber}`}
                className="inline-flex h-11 items-center rounded-full bg-pink px-5 text-xs font-bold text-navy hover:brightness-105 focus-visible:outline-navy"
              >
                E-TICKET
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
