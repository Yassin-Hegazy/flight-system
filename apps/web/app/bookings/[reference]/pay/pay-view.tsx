'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { FormAlert, SUBMIT_CLASS } from '@/components/auth-card';
import { ApiError, errorMessage } from '@/lib/api';
import { isUnauthenticated } from '@/lib/auth';
import { type Booking, getBooking, payBooking, type Payment } from '@/lib/booking-api';
import { formatMoney } from '@/lib/format';

// Payments are mocked: these two tokens are the gateway's test cards.
const CARDS = [
  { token: 'tok_success', label: 'Test card that is accepted' },
  { token: 'tok_declined', label: 'Test card that is declined' },
];

const LINK =
  'inline-flex h-[52px] items-center gap-2 rounded-full bg-navy px-6 text-[15px] font-bold text-white hover:bg-navy-soft';

/** The current time, refreshed every second, for the hold countdown. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const clock = (milliseconds: number) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

/** The hold countdown, payment and declined-card retry (US-BK-02, US-PAY-01, US-PAY-02). */
export function PayView() {
  const { reference } = useParams<{ reference: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const booking = useQuery({
    queryKey: ['booking', reference],
    queryFn: () => getBooking(reference),
    retry: false,
  });

  const signedOut = isUnauthenticated(booking.error);
  useEffect(() => {
    if (signedOut) router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
  }, [signedOut, pathname, router]);

  if (booking.isPending || signedOut) return <p role="status">Loading your booking…</p>;
  if (booking.isError) {
    return (
      <>
        <FormAlert message={errorMessage(booking.error)} />
        <div>
          <Link href="/search" className={LINK}>
            Back to search
          </Link>
        </div>
      </>
    );
  }
  return <Checkout booking={booking.data} />;
}

function Checkout({ booking }: { booking: Booking }) {
  const now = useNow();
  // The payment made on this page, kept for the confirmation (it carries the card).
  const [payment, setPayment] = useState<Payment>();

  const heading = (title: string) => (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-none font-bold text-navy-soft">Booking {booking.reference}</p>
      <h1 className="text-[clamp(2.5rem,5vw,64px)] leading-none font-extrabold">{title}</h1>
    </div>
  );

  if (booking.status !== 'PENDING_PAYMENT') {
    const paid = booking.status === 'CONFIRMED' || booking.status === 'TICKETED';
    return (
      <>
        {heading(paid ? 'Booking confirmed' : 'Booking closed')}
        <Summary booking={booking} payment={payment} paid={paid} />
        <div>
          <Link href={`/bookings/${booking.reference}`} className={LINK}>
            View booking and tickets
          </Link>
        </div>
      </>
    );
  }

  const left = booking.expiresAt ? Date.parse(booking.expiresAt) - now : 0;
  if (left <= 0) {
    return (
      <>
        {heading('Hold expired')}
        <p className="rounded-card border border-line bg-white p-5 text-lg font-bold">
          The hold on these seats has expired. Nothing was charged; search again to book.
        </p>
        <div>
          <Link href="/search" className={LINK}>
            Back to search
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      {heading('Payment')}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card bg-navy p-6 text-white">
        <div>
          <p className="text-[11px] leading-none font-bold text-mist">SEATS HELD FOR</p>
          {/* Not announced every second; the value is there when a screen reader asks for it. */}
          <p
            role="timer"
            aria-live="off"
            className="mt-2 text-[44px] leading-none font-extrabold text-navy tabular-nums"
          >
            {clock(left)}
          </p>
        </div>
        <p className="max-w-[320px] text-sm font-medium text-teal">
          Pay before the time runs out, or the seats go back on sale and the booking closes.
        </p>
      </div>
      <PayForm booking={booking} onPaid={setPayment} />
      <Summary booking={booking} paid={false} />
    </>
  );
}

function PayForm({ booking, onPaid }: { booking: Booking; onPaid: (payment: Payment) => void }) {
  const client = useQueryClient();
  const [token, setToken] = useState(CARDS[0].token);
  // One key per payment attempt: kept if the request never got an answer, new after one.
  const idempotencyKey = useRef<string | null>(null);

  const payment = useMutation({
    mutationFn: () => {
      idempotencyKey.current ??= crypto.randomUUID();
      return payBooking(booking.reference, token, idempotencyKey.current);
    },
    onSuccess: (made) => {
      idempotencyKey.current = null;
      onPaid(made);
      return client.invalidateQueries({ queryKey: ['booking', booking.reference] });
    },
    onError: (error) => {
      if (error instanceof ApiError) idempotencyKey.current = null;
    },
  });

  const reason = payment.error instanceof ApiError ? payment.error.body.fieldErrors?.reason : '';
  const pay = (event: FormEvent) => {
    event.preventDefault();
    payment.mutate();
  };

  return (
    <form
      onSubmit={pay}
      aria-label="Payment"
      className="flex flex-col gap-5 rounded-card border border-line bg-white p-5 sm:p-7"
    >
      {payment.isError && (
        <FormAlert
          message={`${errorMessage(payment.error)}${reason ? ` Reason: ${reason.replaceAll('_', ' ')}.` : ''} You can try again with another card.`}
        />
      )}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-base font-extrabold">Card</legend>
        {CARDS.map((card) => (
          <label
            key={card.token}
            className="flex items-center gap-3 rounded-field border border-input bg-white p-4 text-sm font-semibold"
          >
            <input
              type="radio"
              name="card"
              value={card.token}
              checked={token === card.token}
              onChange={() => setToken(card.token)}
              className="size-4 accent-navy"
            />
            {card.label}
          </label>
        ))}
        <p className="text-xs font-medium text-navy-soft">
          Payments are simulated. No real card is charged.
        </p>
      </fieldset>
      <button type="submit" disabled={payment.isPending} className={SUBMIT_CLASS}>
        {payment.isPending ? 'Paying…' : `Pay ${formatMoney(booking.amount)}`}
      </button>
    </form>
  );
}

function Summary({
  booking,
  payment,
  paid,
}: {
  booking: Booking;
  payment?: Payment;
  paid: boolean;
}) {
  return (
    <section
      aria-label="Booking summary"
      className="flex flex-col gap-4 rounded-card border border-line bg-white p-5 sm:p-7"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-xs font-bold text-navy-soft uppercase">
          {paid ? 'Paid' : booking.status === 'PENDING_PAYMENT' ? 'To pay' : 'Status'}
        </p>
        <p className="text-2xl font-extrabold">
          {paid || booking.status === 'PENDING_PAYMENT'
            ? formatMoney(booking.amount)
            : booking.status.replaceAll('_', ' ').toLowerCase()}
        </p>
      </div>
      {payment?.card && (
        <p className="text-sm font-semibold">
          {payment.card.brand} ending {payment.card.last4}
        </p>
      )}
      <ul className="flex flex-col gap-2 border-t border-line pt-4 text-sm font-medium">
        {booking.passengers.map((passenger, index) => (
          <li key={index} className="flex justify-between gap-4">
            <span>
              {passenger.firstName} {passenger.lastName}
            </span>
            <span>{formatMoney(passenger.fare)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
