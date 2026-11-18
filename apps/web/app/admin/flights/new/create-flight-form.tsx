'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type FormEvent, type HTMLAttributes, useState } from 'react';
import { Field, INPUT_CLASS } from '@/app/search/field';
import { FormAlert } from '@/components/auth-card';
import { createFlight, type NewFlight, utcInstant } from '@/lib/admin-api';
import { errorMessage, fieldErrorsOf, formText } from '@/lib/api';
import { toMinorUnits } from '@/lib/format';
import { ADMIN_CARD, CardHeading, PINK_BUTTON } from '../../admin-parts';

const CURRENCY = 'EGP';

/** Where each API field's message is shown, by the form field's name. */
const FIELD_OF: Record<string, string> = {
  flightNumber: 'flightNumber',
  airlineCode: 'airlineCode',
  originCode: 'originCode',
  destinationCode: 'destinationCode',
  scheduledDepartureUtc: 'departure',
  scheduledArrivalUtc: 'arrival',
  'fares.ECONOMY': 'economyFare',
  'fares.BUSINESS': 'businessFare',
  'capacity.ECONOMY': 'economySeats',
  'capacity.BUSINESS': 'businessSeats',
};

interface Built {
  input?: NewFlight;
  errors: Record<string, string>;
}

/** Reads the form; a fare that is not an amount is caught here, everything else by the API. */
function build(data: FormData): Built {
  const text = (name: string) => formText(data, name).trim();
  const economyFare = toMinorUnits(text('economyFare'), CURRENCY);
  const businessFare = toMinorUnits(text('businessFare'), CURRENCY);
  const errors: Record<string, string> = {};
  if (economyFare === undefined) errors.economyFare = 'Enter an amount such as 15000 or 15000.50.';
  if (businessFare === undefined)
    errors.businessFare = 'Enter an amount such as 60000 or 60000.50.';
  if (economyFare === undefined || businessFare === undefined) return { errors };
  return {
    errors,
    input: {
      flightNumber: text('flightNumber').toUpperCase(),
      airlineCode: text('airlineCode').toUpperCase(),
      originCode: text('originCode').toUpperCase(),
      destinationCode: text('destinationCode').toUpperCase(),
      scheduledDepartureUtc: utcInstant(text('departure')),
      scheduledArrivalUtc: utcInstant(text('arrival')),
      currency: CURRENCY,
      fares: { ECONOMY: economyFare, BUSINESS: businessFare },
      capacity: { ECONOMY: Number(text('economySeats')), BUSINESS: Number(text('businessSeats')) },
    },
  };
}

/** A new scheduled flight with its fares and both cabins' seats (US-AD-01). */
export function CreateFlightForm() {
  const router = useRouter();
  const client = useQueryClient();
  const [local, setLocal] = useState<Record<string, string>>({});
  const create = useMutation({
    mutationFn: createFlight,
    onSuccess: async ({ id }) => {
      await client.invalidateQueries({ queryKey: ['admin-flights'] });
      router.push(`/admin/flights/${id}`);
    },
  });
  const apiErrors = Object.fromEntries(
    Object.entries(fieldErrorsOf(create.error)).map(([key, message]) => [
      FIELD_OF[key] ?? key,
      message,
    ]),
  );
  const errors = { ...apiErrors, ...local };
  const known = Object.values(FIELD_OF).some((name) => apiErrors[name]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { input, errors: found } = build(new FormData(event.currentTarget));
    setLocal(found);
    if (input) create.mutate(input);
  };

  return (
    <form onSubmit={submit} noValidate aria-labelledby="cf-title" className={ADMIN_CARD}>
      <CardHeading kicker="Admin-only action" title="A new scheduled flight" id="cf-title" />
      <p className="-mt-2 text-sm text-navy-soft">
        Times are in UTC (Cairo is UTC+2). Fares are adult fares in {CURRENCY}; children and infants
        are priced from them.
      </p>
      <FormAlert message={create.isError && !known ? errorMessage(create.error) : null} />
      <fieldset className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <legend className="mb-3 text-sm font-extrabold">Flight</legend>
        <Text
          name="flightNumber"
          label="Flight number"
          placeholder="MS801"
          max={6}
          errors={errors}
        />
        <Text name="airlineCode" label="Airline code" placeholder="MS" max={2} errors={errors} />
        <Text name="originCode" label="From" placeholder="CAI" max={3} errors={errors} />
        <Text name="destinationCode" label="To" placeholder="LHR" max={3} errors={errors} />
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-extrabold">Schedule</legend>
        <Text name="departure" label="Departure (UTC)" type="datetime-local" errors={errors} />
        <Text name="arrival" label="Arrival (UTC)" type="datetime-local" errors={errors} />
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <legend className="mb-3 text-sm font-extrabold">Fares and seats</legend>
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
          disabled={create.isPending}
          className={`${PINK_BUTTON} h-[52px] px-8`}
        >
          {create.isPending ? 'Creating…' : 'Create flight'}
        </button>
      </div>
    </form>
  );
}

/** One labelled input; its error comes from the form's merged errors. */
function Text({
  name,
  label,
  errors,
  type = 'text',
  max,
  placeholder,
  inputMode,
}: {
  name: string;
  label: string;
  errors: Record<string, string>;
  type?: 'text' | 'number' | 'datetime-local';
  max?: number;
  placeholder?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  const upper = type === 'text' && max !== undefined;
  return (
    <Field id={`cf-${name}`} label={label} error={errors[name]}>
      {(control) => (
        <input
          {...control}
          name={name}
          type={type}
          maxLength={max}
          min={type === 'number' ? 0 : undefined}
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete="off"
          className={`${INPUT_CLASS} ${upper ? 'uppercase' : ''}`}
        />
      )}
    </Field>
  );
}
