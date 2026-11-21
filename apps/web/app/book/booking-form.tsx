'use client';

import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Field, INPUT_CLASS } from '@/app/search/field';
import { FormAlert, SUBMIT_CLASS } from '@/components/auth-card';
import { ApiError, errorMessage, fieldErrorsOf } from '@/lib/api';
import { useMe } from '@/lib/auth';
import {
  type BookingInput,
  type Cabin,
  createBooking,
  listSavedTravelers,
  type Party,
  type PassengerType,
  type Quote,
  quoteFlight,
  type SavedTraveler,
} from '@/lib/booking-api';
import { dayOf, describeLine, formatMoney, timeOf } from '@/lib/format';

const TYPE_LABEL: Record<PassengerType, string> = {
  ADULT: 'adult',
  CHILD: 'child',
  INFANT: 'infant',
};

interface Person {
  firstName: string;
  lastName: string;
  birthDate: string;
}

const count = (value: string | null, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 9 ? parsed : fallback;
};

/** The trip the URL describes: which flights, for whom, in which cabin. */
function readTrip(params: URLSearchParams) {
  const party: Party = {
    adults: count(params.get('adults'), 1),
    children: count(params.get('children'), 0),
    infants: count(params.get('infants'), 0),
  };
  const types: PassengerType[] = [
    ...Array<PassengerType>(party.adults).fill('ADULT'),
    ...Array<PassengerType>(party.children).fill('CHILD'),
    ...Array<PassengerType>(party.infants).fill('INFANT'),
  ];
  const cabin: Cabin = params.get('cabin') === 'BUSINESS' ? 'BUSINESS' : 'ECONOMY';
  const flightIds = [params.get('flightId'), params.get('returnFlightId')].filter(
    (id): id is string => Boolean(id),
  );
  return { party, types, cabin, flightIds };
}

/**
 * Passengers and price confirmation (US-BK-01, US-BK-03, US-BK-09). Submitting creates the booking,
 * which holds the seats for 15 minutes, and moves on to payment.
 */
export function BookingForm() {
  const router = useRouter();
  const params = useSearchParams();
  const query = params.toString();
  const { party, types, cabin, flightIds } = readTrip(params);
  const me = useMe();

  useEffect(() => {
    if (me === null) router.replace(`/sign-in?next=${encodeURIComponent(`/book?${query}`)}`);
  }, [me, query, router]);

  const quotes = useQueries({
    queries: flightIds.map((id) => ({
      queryKey: ['quote', id, party, cabin],
      queryFn: () => quoteFlight(id, party, cabin),
      retry: false,
    })),
  });
  const saved = useQuery({
    queryKey: ['saved-travelers'],
    queryFn: listSavedTravelers,
    enabled: Boolean(me),
  });

  if (flightIds.length === 0) {
    return <FormAlert message="No flight was chosen. Start from the search." />;
  }
  const failed = quotes.find((quote) => quote.isError);
  if (failed) return <FormAlert message={errorMessage(failed.error)} />;
  if (!me || quotes.some((quote) => quote.isPending)) {
    return <p role="status">Loading your trip…</p>;
  }
  const priced = quotes.map((quote) => quote.data as Quote);

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
      <PassengersForm
        trip={{ types, cabin, flightIds }}
        priced={priced}
        saved={saved.data ?? []}
        signInPath={`/sign-in?next=${encodeURIComponent(`/book?${query}`)}`}
      />
      <TripSummary priced={priced} cabin={cabin} />
    </div>
  );
}

/** The trip's total: its flights' totals, each priced by the API. The only sum made here. */
const totalOf = (priced: Quote[]) =>
  priced.reduce((sum, quote) => sum + quote.total.amountMinor, 0);

interface PassengersFormProps {
  trip: { types: PassengerType[]; cabin: Cabin; flightIds: string[] };
  priced: Quote[];
  saved: SavedTraveler[];
  signInPath: string;
}

function PassengersForm({ trip, priced, saved, signInPath }: PassengersFormProps) {
  const router = useRouter();
  const { types, cabin, flightIds } = trip;
  const currency = priced[0].total.currency;
  const shownTotal = totalOf(priced);

  const [people, setPeople] = useState<Person[]>(() =>
    types.map(() => ({ firstName: '', lastName: '', birthDate: '' })),
  );
  // A fare the API reported as changed, waiting for the traveler to accept or walk away.
  const [changed, setChanged] = useState<{ total: number; currency: string } | null>(null);
  // One key per attempt: kept for a retry of the same request, dropped once the API has answered.
  const idempotencyKey = useRef<string | null>(null);

  const booking = useMutation({
    mutationFn: (input: BookingInput) => {
      idempotencyKey.current ??= crypto.randomUUID();
      return createBooking(input, idempotencyKey.current);
    },
    onSuccess: (created) => router.push(`/bookings/${created.reference}/pay`),
    onError: (error) => {
      if (!(error instanceof ApiError)) return;
      idempotencyKey.current = null;
      if (error.status === 401) {
        router.replace(signInPath);
      }
      const { currentTotal, currency } = error.body.fieldErrors ?? {};
      if (error.body.code === 'PRICE_CHANGED' && currentTotal && currency) {
        setChanged({ total: Number(currentTotal), currency });
      }
    },
  });

  const errors = fieldErrorsOf(booking.error);
  const priceChanged =
    booking.error instanceof ApiError && booking.error.body.code === 'PRICE_CHANGED';
  const placed = Object.keys(errors).some((name) => name.startsWith('passengers.'));

  const submit = (displayedTotal: number) => {
    const [flightId, returnFlightId] = flightIds;
    booking.mutate({
      flightId,
      ...(returnFlightId ? { returnFlightId } : {}),
      cabin,
      displayedTotal,
      passengers: people.map((person, index) => ({
        firstName: person.firstName.trim(),
        lastName: person.lastName.trim(),
        birthDate: person.birthDate,
        type: types[index],
      })),
    });
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setChanged(null);
    submit(shownTotal);
  };
  const update = (index: number, patch: Partial<Person>) =>
    setPeople((current) =>
      current.map((person, i) => (i === index ? { ...person, ...patch } : person)),
    );

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Passengers" className="flex flex-col gap-6">
      {changed && priceChanged ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-card border-2 border-danger bg-white p-5"
        >
          <p className="text-lg font-extrabold">{errorMessage(booking.error)}</p>
          <p className="text-sm font-medium">
            New total {formatMoney({ amountMinor: changed.total, currency: changed.currency })}. You
            were shown {formatMoney({ amountMinor: shownTotal, currency })}. Nothing has been
            booked.
          </p>
          <button
            type="button"
            onClick={() => submit(changed.total)}
            disabled={booking.isPending}
            className={`${SUBMIT_CLASS} sm:w-auto`}
          >
            Accept {formatMoney({ amountMinor: changed.total, currency: changed.currency })} and
            continue
          </button>
        </div>
      ) : (
        <FormAlert message={booking.isError && !placed ? errorMessage(booking.error) : null} />
      )}

      {types.map((type, index) => {
        const id = (field: string) => `p${index}-${field}`;
        const error = (field: string) => errors[`passengers.${index}.${field}`];
        const person = people[index];
        return (
          <fieldset
            key={index}
            className="grid gap-4 rounded-card border border-line bg-white p-5 sm:grid-cols-3 sm:p-7"
          >
            <legend className="float-left mb-1 w-full text-base font-extrabold sm:col-span-3">
              Passenger {index + 1}, {TYPE_LABEL[type]}
            </legend>
            {saved.length > 0 && (
              <Field id={id('saved')} label="Fill from a saved traveler" className="sm:col-span-3">
                {(control) => (
                  <select
                    {...control}
                    value=""
                    onChange={(event) => {
                      const traveler = saved.find((one) => one.id === event.target.value);
                      if (!traveler) return;
                      const space = traveler.name.indexOf(' ');
                      update(index, {
                        firstName: space < 0 ? traveler.name : traveler.name.slice(0, space),
                        lastName: space < 0 ? '' : traveler.name.slice(space + 1),
                        birthDate: traveler.dateOfBirth,
                      });
                    }}
                    className={INPUT_CLASS}
                  >
                    <option value="">Choose a traveler…</option>
                    {saved.map((traveler) => (
                      <option key={traveler.id} value={traveler.id}>
                        {traveler.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            )}
            <Field id={id('firstName')} label="First name" error={error('firstName')}>
              {(control) => (
                <input
                  {...control}
                  type="text"
                  autoComplete="off"
                  value={person.firstName}
                  onChange={(event) => update(index, { firstName: event.target.value })}
                  className={INPUT_CLASS}
                />
              )}
            </Field>
            <Field id={id('lastName')} label="Last name" error={error('lastName')}>
              {(control) => (
                <input
                  {...control}
                  type="text"
                  autoComplete="off"
                  value={person.lastName}
                  onChange={(event) => update(index, { lastName: event.target.value })}
                  className={INPUT_CLASS}
                />
              )}
            </Field>
            {/* An age that does not fit the passenger type is reported against the birth date. */}
            <Field
              id={id('birthDate')}
              label="Date of birth"
              error={error('birthDate') ?? error('type')}
            >
              {(control) => (
                <input
                  {...control}
                  type="date"
                  value={person.birthDate}
                  onChange={(event) => update(index, { birthDate: event.target.value })}
                  className={INPUT_CLASS}
                />
              )}
            </Field>
          </fieldset>
        );
      })}

      <div>
        <button type="submit" disabled={booking.isPending} className={`${SUBMIT_CLASS} sm:w-auto`}>
          {booking.isPending ? 'Holding your seats…' : 'Hold seats and continue'}
        </button>
      </div>
    </form>
  );
}

function TripSummary({ priced, cabin }: { priced: Quote[]; cabin: Cabin }) {
  const shownTotal = totalOf(priced);
  const currency = priced[0].total.currency;
  return (
    <aside
      aria-label="Your trip"
      className="flex flex-col gap-5 rounded-card bg-navy p-6 text-white"
    >
      <p className="text-[11px] leading-none font-bold text-mist">YOUR TRIP</p>
      {priced.map((quote, index) => (
        <div key={quote.flightId} className="flex flex-col gap-2 border-b border-navy-soft pb-5">
          <p className="text-xs font-bold text-mist uppercase">
            {priced.length > 1 ? (index === 0 ? 'Outbound' : 'Return') : 'Flight'} ·{' '}
            {quote.flightNumber} · {quote.airline.name}
          </p>
          <p className="text-2xl leading-tight font-extrabold">
            {quote.origin.code} <span aria-hidden="true">→</span>
            <span className="sr-only">to</span> {quote.destination.code}
          </p>
          <p className="text-sm font-medium text-teal">
            {dayOf(quote.departureLocal)} · {timeOf(quote.departureLocal)} to{' '}
            {timeOf(quote.arrivalLocal)} · {cabin === 'ECONOMY' ? 'Economy' : 'Business'}
          </p>
          <ul className="text-xs font-medium text-teal">
            {quote.breakdown.map((line) => (
              <li key={line.passengerType}>
                {describeLine(line)} = {formatMoney(line.amount)}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-xs font-bold text-mist">TOTAL</p>
        <p
          data-testid="booking-total"
          className="text-[28px] leading-none font-extrabold text-navy"
        >
          {formatMoney({ amountMinor: shownTotal, currency })}
        </p>
      </div>
      <p className="text-xs font-medium text-mist">
        Continuing holds these seats for 15 minutes while you pay. You are not charged yet.
      </p>
    </aside>
  );
}
