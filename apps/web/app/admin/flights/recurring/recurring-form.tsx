'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { scheduleRecurring, type RecurringSeries } from '@/lib/admin-api';
import { ApiError, fieldErrorsOf, formText } from '@/lib/api';
import { dayOf, toMinorUnits } from '@/lib/format';
import { ADMIN_CARD, CardHeading, PINK_BUTTON } from '../../admin-parts';
import { CURRENCY, Text } from '../new/create-flight-form';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** What each refusal means, for the codes the API sends for a whole series. */
const SERIES_ERRORS: Record<string, string> = {
  INVALID_DATE_RANGE: 'The last date must be on or after the first, and at most 90 days later.',
  NO_MATCHING_DATES: 'None of the chosen weekdays fall between those two dates.',
  UNKNOWN_AIRPORT: 'The departure airport is not one the catalog knows.',
  SERIES_REJECTED: 'These dates were refused:',
};

/** API field names → this form's field names. */
const FIELD_OF: Record<string, string> = {
  'template.flightNumber': 'flightNumber',
  'template.airlineCode': 'airlineCode',
  'template.originCode': 'originCode',
  'template.destinationCode': 'destinationCode',
  'template.fares.ECONOMY': 'economyFare',
  'template.fares.BUSINESS': 'businessFare',
  'template.capacity.ECONOMY': 'economySeats',
  'template.capacity.BUSINESS': 'businessSeats',
  from: 'from',
  to: 'to',
  weekdays: 'weekdays',
  localDeparture: 'localDeparture',
  durationMinutes: 'durationMinutes',
};

function build(data: FormData): { series?: RecurringSeries; errors: Record<string, string> } {
  const text = (name: string) => formText(data, name).trim();
  const economy = toMinorUnits(text('economyFare'), CURRENCY);
  const business = toMinorUnits(text('businessFare'), CURRENCY);
  const weekdays = data.getAll('weekday').map(Number);
  const errors: Record<string, string> = {};
  if (economy === undefined) errors.economyFare = 'Enter an amount such as 15000.';
  if (business === undefined) errors.businessFare = 'Enter an amount such as 60000.';
  if (weekdays.length === 0) errors.weekdays = 'Choose at least one weekday.';
  if (economy === undefined || business === undefined || weekdays.length === 0) return { errors };
  return {
    errors,
    series: {
      template: {
        flightNumber: text('flightNumber').toUpperCase(),
        airlineCode: text('airlineCode').toUpperCase(),
        originCode: text('originCode').toUpperCase(),
        destinationCode: text('destinationCode').toUpperCase(),
        currency: CURRENCY,
        fares: { ECONOMY: economy, BUSINESS: business },
        capacity: {
          ECONOMY: Number(text('economySeats')),
          BUSINESS: Number(text('businessSeats')),
        },
      },
      from: text('from'),
      to: text('to'),
      weekdays,
      localDeparture: text('localDeparture'),
      durationMinutes: Number(text('durationMinutes')),
    },
  };
}

/** A series of flights on chosen weekdays (US-AD-08). One failing date rejects the whole series. */
export function RecurringForm() {
  const client = useQueryClient();
  const [local, setLocal] = useState<Record<string, string>>({});
  const schedule = useMutation({
    mutationFn: scheduleRecurring,
    onSuccess: () => client.invalidateQueries({ queryKey: ['admin-flights'] }),
  });
  const apiErrors = Object.fromEntries(
    Object.entries(fieldErrorsOf(schedule.error))
      .filter(([key]) => FIELD_OF[key])
      .map(([key, message]) => [FIELD_OF[key], message]),
  );
  const errors = { ...apiErrors, ...local };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { series, errors: found } = build(new FormData(event.currentTarget));
    setLocal(found);
    if (series) schedule.mutate(series);
  };

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} noValidate aria-labelledby="rf-title" className={ADMIN_CARD}>
        <CardHeading kicker="Admin-only action" title="A series of flights" id="rf-title" />
        <SeriesError error={schedule.error} />
        <fieldset className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <legend className="mb-3 text-sm font-extrabold">Flight</legend>
          <Text
            name="flightNumber"
            label="Flight number"
            placeholder="MS805"
            max={6}
            errors={errors}
          />
          <Text name="airlineCode" label="Airline code" placeholder="MS" max={2} errors={errors} />
          <Text name="originCode" label="From" placeholder="CAI" max={3} errors={errors} />
          <Text name="destinationCode" label="To" placeholder="LHR" max={3} errors={errors} />
        </fieldset>
        <fieldset className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <legend className="mb-3 text-sm font-extrabold">When</legend>
          <Text name="from" label="First date" type="date" errors={errors} />
          <Text name="to" label="Last date" type="date" errors={errors} />
          <Text
            name="localDeparture"
            label="Departure (local at origin)"
            type="time"
            errors={errors}
          />
          <Text name="durationMinutes" label="Duration (minutes)" type="number" errors={errors} />
        </fieldset>
        <fieldset
          aria-describedby={errors.weekdays ? 'weekdays-error' : undefined}
          className="flex flex-col gap-3"
        >
          <legend className="mb-3 text-sm font-extrabold">On these weekdays</legend>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day, index) => (
              <label
                key={day}
                className="flex cursor-pointer items-center gap-2 rounded-full border border-line bg-ice px-4 py-2 text-sm font-semibold has-[:checked]:border-navy has-[:checked]:bg-navy has-[:checked]:text-white"
              >
                <input type="checkbox" name="weekday" value={index + 1} className="accent-pink" />
                {day}
              </label>
            ))}
          </div>
          {errors.weekdays && (
            <p id="weekdays-error" className="text-sm text-destructive">
              {errors.weekdays}
            </p>
          )}
        </fieldset>
        <fieldset className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <legend className="mb-3 text-sm font-extrabold">Fares and seats, for every flight</legend>
          <Text
            name="economyFare"
            label={`Economy fare (${CURRENCY})`}
            inputMode="decimal"
            errors={errors}
          />
          <Text
            name="businessFare"
            label={`Business fare (${CURRENCY})`}
            inputMode="decimal"
            errors={errors}
          />
          <Text name="economySeats" label="Economy seats" type="number" errors={errors} />
          <Text name="businessSeats" label="Business seats" type="number" errors={errors} />
        </fieldset>
        <div>
          <button
            type="submit"
            disabled={schedule.isPending}
            className={`${PINK_BUTTON} h-[52px] px-8`}
          >
            {schedule.isPending ? 'Scheduling…' : 'Schedule flights'}
          </button>
        </div>
      </form>

      {schedule.data && (
        <section aria-labelledby="made-title" className={ADMIN_CARD}>
          <p id="made-title" role="status" className="text-xl font-extrabold">
            {schedule.data.flights.length}{' '}
            {schedule.data.flights.length === 1 ? 'flight' : 'flights'} scheduled.
          </p>
          <ul aria-label="Scheduled flights" className="flex flex-wrap gap-2">
            {schedule.data.flights.map(({ date, id }) => (
              <li key={id}>
                <Link
                  href={`/admin/flights/${id}`}
                  className="inline-flex h-10 items-center rounded-full border border-line bg-ice px-4 text-sm font-bold hover:border-navy"
                >
                  {dayOf(date)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** A refused series: what went wrong and, for each failing date, why. */
function SeriesError({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) return null;
  const { code, message, fieldErrors = {} } = error.body;
  const dates = Object.entries(fieldErrors).filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key));
  if (code === 'VALIDATION_ERROR' && dates.length === 0) return null;
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-[12px] border border-danger p-3 text-sm text-danger"
    >
      <p className="font-bold">No flights were scheduled. {SERIES_ERRORS[code] ?? message}</p>
      {dates.length > 0 && (
        <ul className="flex flex-col gap-1 font-mono text-xs">
          {dates.map(([date, reason]) => (
            <li key={date}>
              {date}: {reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
