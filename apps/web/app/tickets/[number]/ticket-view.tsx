'use client';

import { useQuery } from '@tanstack/react-query';
import { Plane } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormAlert } from '@/components/auth-card';
import { NAVY_LINK, PageHeading, PINK_LINK, StatusPill } from '@/components/page-parts';
import { errorMessage } from '@/lib/api';
import { useSignInRedirect } from '@/lib/auth';
import { dayOf, formatInstant, timeOf } from '@/lib/format';
import { type ETicket, getETicket, getTicket, statusLabel } from '@/lib/trips-api';

/** One ticket and its printable e-ticket (US-TK-02, US-TK-04). */
export function TicketView() {
  const { number } = useParams<{ number: string }>();
  const ticket = useQuery({
    queryKey: ['ticket', number],
    queryFn: () => getTicket(number),
    retry: false,
  });
  const pass = useQuery({
    queryKey: ['e-ticket', number],
    queryFn: () => getETicket(number),
    retry: false,
  });
  const failure = ticket.error ?? pass.error;
  const signedOut = useSignInRedirect(failure);

  if (signedOut || (!failure && (ticket.isPending || pass.isPending))) {
    return <p role="status">Loading the ticket…</p>;
  }
  if (!ticket.data || !pass.data) {
    return (
      <>
        <FormAlert message={errorMessage(failure)} />
        <div>
          <Link href="/bookings" className={NAVY_LINK}>
            Back to my trips
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <PageHeading eyebrow="E-ticket" title={`Ticket ${ticket.data.ticketNumber}`} />
        <StatusPill label={statusLabel(ticket.data.status)} testId="ticket-status" />
      </div>
      <Pass pass={pass.data} />
      <p className="text-sm font-medium text-navy-soft">
        Issued {formatInstant(ticket.data.issuedAt)} · flight currently{' '}
        {statusLabel(ticket.data.flight.status).toLowerCase()} · times are local to each airport.
      </p>
      <div className="flex flex-wrap gap-3 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className={`${PINK_LINK} cursor-pointer`}
        >
          Print e-ticket
        </button>
        <Link href={`/bookings/${ticket.data.bookingReference}`} className={NAVY_LINK}>
          Back to booking {ticket.data.bookingReference}
        </Link>
      </div>
    </>
  );
}

/** The boarding-pass drawing of the e-ticket. It is the only thing left on a printed page. */
function Pass({ pass }: { pass: ETicket }) {
  return (
    <section
      aria-label="E-ticket"
      className="relative overflow-hidden rounded-[22px] border-2 border-navy bg-teal print:break-inside-avoid"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 bg-pink px-5 py-4 sm:px-7">
        <p className="text-2xl leading-none font-extrabold sm:text-[32px]">{pass.airline}</p>
        <p className="rounded-full bg-navy px-4 py-2 text-xs font-bold text-white">
          {pass.cabin === 'ECONOMY' ? 'ECONOMY' : 'BUSINESS'}
        </p>
      </div>
      <div className="px-5 pt-6 sm:px-7">
        <p className="text-[10px] leading-none font-bold text-navy-soft">
          PASSENGER / NAME ON TICKET
        </p>
        <p className="mt-2 text-2xl leading-tight font-extrabold uppercase sm:text-[32px]">
          {pass.passengerName}
        </p>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 pt-6 sm:px-7">
        <p className="text-[clamp(2.25rem,8vw,64px)] leading-none font-extrabold">{pass.from}</p>
        <Plane aria-hidden="true" className="size-8 rotate-45 text-pink sm:size-11" />
        <p className="text-right text-[clamp(2.25rem,8vw,64px)] leading-none font-extrabold">
          {pass.to}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 px-5 py-7 sm:grid-cols-4 sm:px-7">
        <Detail label="Flight">{pass.flightNumber}</Detail>
        <Detail label="Date">{dayOf(pass.departureLocal)}</Detail>
        <Detail label="Departs">
          <time dateTime={pass.departureLocal} data-testid="departs">
            {timeOf(pass.departureLocal)}
          </time>
        </Detail>
        <Detail label="Arrives">
          <time dateTime={pass.arrivalLocal} data-testid="arrives">
            {timeOf(pass.arrivalLocal)}
          </time>
        </Detail>
        <Detail label="Booking">{pass.bookingReference}</Detail>
        <Detail label="Ticket">{pass.ticketNumber}</Detail>
      </dl>
      {pass.voidMarking && (
        <p
          data-testid="void-marking"
          className="border-t-2 border-danger bg-white px-5 py-4 text-center text-[40px] leading-none font-extrabold tracking-[0.3em] text-danger"
        >
          {pass.voidMarking}
        </p>
      )}
    </section>
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
