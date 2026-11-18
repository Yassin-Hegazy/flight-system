'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormAlert } from '@/components/auth-card';
import { NAVY_LINK, StatusPill } from '@/components/page-parts';
import { errorMessage } from '@/lib/api';
import { useSignInRedirect } from '@/lib/auth';
import { dayOf, formatDuration, formatInstant, formatMoney, timeOf } from '@/lib/format';
import {
  type BookingDetail,
  getBookingDetail,
  getETicket,
  getTicket,
  listTickets,
  statusLabel,
  type Ticket,
} from '@/lib/trips-api';

const CABIN = { ECONOMY: 'Economy', BUSINESS: 'Business' } as const;
const CARD = 'rounded-[24px] border border-line bg-white p-5 sm:p-7';
const KICKER = 'text-xs leading-none font-bold text-navy-soft uppercase';

/** One ticket, laid out as Figma's e-ticket page (US-TK-02, US-TK-04). */
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
  const reference = ticket.data?.bookingReference;
  // The booking adds the other legs and the fares; the ticket page still works without it.
  const booking = useQuery({
    queryKey: ['booking', reference],
    queryFn: () => getBookingDetail(reference!),
    enabled: Boolean(reference),
    retry: false,
  });
  const siblings = useQuery({
    queryKey: ['tickets', reference],
    queryFn: () => listTickets(reference!),
    enabled: Boolean(reference),
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
  const t = ticket.data;
  const legs = legsOf(t, siblings.data);

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Breadcrumb" className="text-xs font-bold text-navy-soft uppercase">
            <Link href="/bookings" className="hover:underline">
              My trips
            </Link>
            <span aria-hidden="true"> / </span>
            <Link href={`/bookings/${t.bookingReference}`} className="hover:underline">
              Booking {t.bookingReference}
            </Link>
            <span aria-hidden="true"> / </span>
            <span>E-ticket</span>
          </nav>
          <StatusPill label={statusLabel(t.status)} testId="ticket-status" />
        </div>
        <h1 className="text-[clamp(2.25rem,5vw,55px)] leading-none font-extrabold">
          Ticket {t.ticketNumber}
        </h1>
        <p className="text-lg text-navy-soft">
          Your trip, all in one place: the journey, the fare and your document.
        </p>
      </div>

      <Stepper />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_382px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Journey
            ticket={t}
            legs={legs}
            passengers={booking.data?.passengers.length}
            voidMarking={pass.data.voidMarking}
          />
          <Essentials ticket={t} />
        </div>
        <div className="flex flex-col gap-6">
          <FareSummary booking={booking.data} trip={tripLabel(legs)} />
          <Document ticket={t} />
          <Advisory void={pass.data.voidMarking !== null} />
        </div>
      </div>
    </>
  );
}

/** This passenger's tickets on the booking, in departure order; the opened one if the list is not in yet. */
function legsOf(ticket: Ticket, all: Ticket[] | undefined): Ticket[] {
  const mine = (all ?? []).filter((other) => other.passengerName === ticket.passengerName);
  const legs = mine.some((other) => other.ticketNumber === ticket.ticketNumber) ? mine : [ticket];
  return [...legs].sort(
    (a, b) =>
      new Date(a.flight.scheduledDepartureLocal).getTime() -
      new Date(b.flight.scheduledDepartureLocal).getTime(),
  );
}

const isRoundTrip = (legs: Ticket[]) =>
  legs.length === 2 && legs[0].flight.origin.code === legs[1].flight.destination.code;

const tripLabel = (legs: Ticket[]) =>
  isRoundTrip(legs) ? 'Round trip' : legs.length > 1 ? 'Multi-flight' : 'One way';

function Stepper() {
  const steps = ['Search', 'Select', 'E-ticket'];
  return (
    <ol
      aria-label="Progress"
      className="flex flex-wrap items-center justify-center gap-3 print:hidden"
    >
      {steps.map((step, index) => {
        const current = index === steps.length - 1;
        return (
          <li key={step} className="flex items-center gap-3">
            {index > 0 && (
              <span
                aria-hidden="true"
                className="hidden h-[2px] w-[120px] rounded bg-line md:block"
              />
            )}
            <span
              aria-current={current ? 'step' : undefined}
              className={`flex h-12 items-center gap-3 rounded-full px-5 text-sm font-bold ${current ? 'bg-navy text-white' : 'border border-line bg-white'}`}
            >
              <span
                aria-hidden="true"
                className={`text-[11px] ${current ? 'text-pink' : 'text-navy-soft'}`}
              >
                0{index + 1}
              </span>
              {step}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

interface JourneyProps {
  ticket: Ticket;
  legs: Ticket[];
  passengers?: number;
  voidMarking: string | null;
}

/** The trip card: route, cabin and party, then one block per flight. Printing keeps only this. */
function Journey({ ticket, legs, passengers, voidMarking }: JourneyProps) {
  const first = legs[0].flight;
  const people = passengers ?? 1;
  const arrow = isRoundTrip(legs) ? '↔' : '→';
  return (
    <section
      aria-label="E-ticket"
      className={`${CARD} relative flex flex-col gap-5 print:break-inside-avoid`}
    >
      <span
        aria-hidden="true"
        className="absolute top-7 left-[-1px] h-[124px] w-[5px] rounded-sm bg-pink"
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className={KICKER}>
            {tripLabel(legs)} · {CABIN[ticket.cabin]} · {people}{' '}
            {people === 1 ? 'passenger' : 'passengers'}
          </p>
          <h2 className="mt-3 text-[clamp(1.75rem,3.5vw,37px)] leading-tight font-extrabold">
            {first.origin.city} {arrow} {first.destination.city}
          </h2>
          <p className="mt-2 text-base font-semibold">
            {ticket.passengerName} · {ticket.flight.airline.name}
          </p>
        </div>
        <span className="rounded-full bg-teal px-4 py-2 text-[11px] font-bold text-navy-soft">
          BOOKING {ticket.bookingReference}
        </span>
      </div>
      <hr className="border-line" />
      {legs.map((leg, index) => (
        <Leg
          key={leg.ticketNumber}
          leg={leg}
          label={
            legs.length === 1
              ? 'Outbound'
              : isRoundTrip(legs)
                ? ['Outbound', 'Return'][index]
                : `Flight ${index + 1}`
          }
          current={leg.ticketNumber === ticket.ticketNumber}
        />
      ))}
      {voidMarking && (
        <p
          data-testid="void-marking"
          className="rounded-[14px] border-2 border-danger bg-white px-5 py-4 text-center text-[40px] leading-none font-extrabold tracking-[0.3em] text-danger"
        >
          {voidMarking}
        </p>
      )}
      <p className="text-[11px] text-navy-soft">
        Times are local to each airport. Booking {ticket.bookingReference} · ticket{' '}
        {ticket.ticketNumber}.
      </p>
    </section>
  );
}

const minutesBetween = (from: string, to: string) =>
  Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000);

/** "Same day", "Next day", or the arrival's own day. Both are dates at their own airport. */
function arrivalDay(departure: string, arrival: string): string {
  const days = (Date.parse(arrival.slice(0, 10)) - Date.parse(departure.slice(0, 10))) / 86_400_000;
  if (days === 0) return 'Same day';
  return days === 1 ? 'Next day' : dayOf(arrival);
}

function Leg({ leg, label, current }: { leg: Ticket; label: string; current: boolean }) {
  const f = leg.flight;
  const departs = f.scheduledDepartureLocal;
  const arrives = f.scheduledArrivalLocal;
  return (
    <div
      role="group"
      aria-label={`${label}, ${f.flightNumber}`}
      className="relative flex flex-col gap-5 rounded-[17px] bg-ice p-5 sm:px-[22px]"
    >
      <span
        aria-hidden="true"
        className={`absolute top-[23px] left-0 h-[66px] w-1 rounded-sm ${label === 'Return' ? 'bg-navy' : 'bg-pink'}`}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-bold text-navy-soft">
          {`${label} · ${dayOf(departs)}`.toUpperCase()}
        </p>
        <span className="rounded-full bg-teal px-4 py-1.5 text-[10px] font-bold text-navy-soft">
          NONSTOP
        </span>
      </div>
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <div>
          <time
            dateTime={departs}
            data-testid={current ? 'departs' : undefined}
            className="block text-[clamp(2rem,4vw,41px)] leading-none font-extrabold"
          >
            {timeOf(departs)}
          </time>
          <p className="mt-2 text-sm font-bold">
            {f.origin.code} · {f.origin.city}
          </p>
        </div>
        <div className="flex flex-col items-center gap-1 px-2">
          <div aria-hidden="true" className="flex w-full max-w-[314px] items-center">
            <span className="size-3 shrink-0 rounded-full bg-pink" />
            <span className="relative h-[2px] flex-1 bg-line">
              <span className="absolute -top-[22px] left-1/2 -translate-x-1/2 text-[32px] leading-none text-pink">
                →
              </span>
            </span>
            <span className="size-3 shrink-0 rounded-full bg-navy" />
          </div>
          <span className="sr-only">to</span>
          <p className="text-center text-xs font-medium text-navy-soft">
            {formatDuration(minutesBetween(departs, arrives))} · Direct
          </p>
        </div>
        <div className="text-right">
          <time
            dateTime={arrives}
            data-testid={current ? 'arrives' : undefined}
            className="block text-[clamp(2rem,4vw,41px)] leading-none font-extrabold"
          >
            {timeOf(arrives)}
          </time>
          <p className="mt-2 text-sm font-bold">
            {f.destination.code} · {f.destination.city}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-3">
        <Detail label="Flight">
          {f.flightNumber}
          {current && <span className="ml-2 text-xs text-navy-soft">· this ticket</span>}
        </Detail>
        <Detail label="Ticket">{leg.ticketNumber}</Detail>
        <Detail label="Arrives" className="sm:text-right">
          {arrivalDay(departs, arrives)}
        </Detail>
      </dl>
    </div>
  );
}

function Detail({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[10px] font-bold text-navy-soft uppercase">{label}</dt>
      <dd className="mt-1 text-base font-bold">{children}</dd>
    </div>
  );
}

/** Each passenger's fare and the booking total, as the API priced them. */
function FareSummary({ booking, trip }: { booking?: BookingDetail; trip: string }) {
  return (
    <section aria-label="Fare summary" className={`${CARD} flex flex-col gap-4`}>
      <div>
        <p className={KICKER}>Fare summary</p>
        <h2 className="mt-3 text-[28px] leading-tight font-extrabold">Price, clearly.</h2>
        {booking && (
          <p className="mt-1 text-[13px] text-navy-soft">
            {trip} · {booking.passengers.length}{' '}
            {booking.passengers.length === 1 ? 'passenger' : 'passengers'} ·{' '}
            {booking.amount.currency}
          </p>
        )}
      </div>
      {!booking ? (
        <p role="status" className="text-sm text-navy-soft">
          Loading the fare…
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-3 border-t border-line pt-4">
            {booking.passengers.map((passenger) => (
              <li
                key={`${passenger.firstName}-${passenger.lastName}-${passenger.birthDate}`}
                className="flex items-baseline justify-between gap-4 text-sm"
              >
                <span className="font-medium">
                  {passenger.firstName} {passenger.lastName}
                </span>
                <span className="font-semibold">{formatMoney(passenger.fare)}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-end justify-between gap-4 border-t border-line pt-4">
            <span className="text-[11px] font-bold whitespace-nowrap text-navy-soft">
              BOOKING TOTAL
            </span>
            <span
              data-testid="fare-total"
              className="text-[clamp(1.5rem,3vw,33px)] leading-none font-extrabold"
            >
              {formatMoney(booking.amount)}
            </span>
          </div>
          <span aria-hidden="true" className="h-1 rounded-sm bg-pink" />
        </>
      )}
    </section>
  );
}

function Document({ ticket }: { ticket: Ticket }) {
  return (
    <section
      aria-label="Your document"
      className="flex flex-col gap-4 rounded-[24px] bg-navy p-6 text-white"
    >
      <p className="text-[11px] font-bold text-teal">YOUR DOCUMENT</p>
      <p className="text-2xl font-bold">E-ticket {ticket.ticketNumber}</p>
      <div className="border-t border-navy-soft pt-4">
        <p className="text-[10px] font-bold text-teal">BOOKING REFERENCE</p>
        <p className="mt-1 text-[21px] font-extrabold">{ticket.bookingReference}</p>
      </div>
      <div className="flex flex-col gap-3 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="h-[51px] cursor-pointer rounded-[15px] bg-teal text-[13px] font-bold text-navy hover:bg-white focus-visible:outline-pink"
        >
          Print e-ticket <span aria-hidden="true">↗</span>
        </button>
        <Link
          href={`/bookings/${ticket.bookingReference}`}
          className="text-center text-sm font-bold text-teal underline"
        >
          Back to booking {ticket.bookingReference}
        </Link>
      </div>
    </section>
  );
}

function Essentials({ ticket }: { ticket: Ticket }) {
  return (
    <section aria-label="Passenger and travel essentials" className={`${CARD} flex flex-col gap-5`}>
      <div>
        <p className={KICKER}>Passenger &amp; travel essentials</p>
        <h2 className="mt-3 text-[27px] leading-tight font-extrabold">The details that matter.</h2>
      </div>
      <dl className="grid gap-5 border-t border-line pt-5 sm:grid-cols-3">
        <Detail label="Passenger">{ticket.passengerName}</Detail>
        <Detail label="Cabin">{CABIN[ticket.cabin]}</Detail>
        <Detail label="Ticket number">{ticket.ticketNumber}</Detail>
        <Detail label="Issued">{formatInstant(ticket.issuedAt)}</Detail>
        <Detail label="Ticket status">{statusLabel(ticket.status)}</Detail>
        <Detail label="Flight status">{statusLabel(ticket.flight.status)}</Detail>
      </dl>
    </section>
  );
}

function Advisory({ void: isVoid }: { void: boolean }) {
  return (
    <aside className="flex flex-col gap-4 rounded-[22px] border border-line bg-ice p-6 print:hidden">
      <span aria-hidden="true" className="h-1 w-[42px] rounded-sm bg-pink" />
      <p className="text-[23px] leading-tight font-bold">
        {isVoid ? 'This ticket is void.' : 'Good to know.'}
      </p>
      <p className="text-[15px]">
        {isVoid
          ? 'It no longer entitles anyone to travel. Any refund is shown on the booking’s receipt.'
          : 'Times are local to each airport. Bring a photo ID matching the passenger name, and arrive early for check-in.'}
      </p>
      <p className="text-[11px] font-medium text-navy-soft">
        Delays and changes to this flight also reach your inbox.
      </p>
    </aside>
  );
}
