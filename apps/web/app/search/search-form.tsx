'use client';

import type { FormEvent } from 'react';
import { fromMinorUnits, toMinorUnits } from '@/lib/format';
import { AirportInput } from './airport-input';
import { Field, INPUT_CLASS } from './field';

/** The query parameters the form owns; sort and page are owned by the results. */
const FORM_PARAMS = [
  'origin',
  'destination',
  'date',
  'returnDate',
  'adults',
  'children',
  'infants',
  'cabin',
  'maxTotal',
  'departFrom',
  'departTo',
  'airlines',
];
const PAGE_PARAMS = ['page', 'outboundPage', 'inboundPage'];

interface SearchFormProps {
  params: URLSearchParams;
  errors: Record<string, string>;
  pending: boolean;
  onSearch: (next: URLSearchParams) => void;
}

/**
 * Builds the next URL from the form. Empty fields are left out, so the API applies its defaults.
 * The price is typed in major units and sent as minor units, the only unit the API accepts.
 */
function nextParams(form: HTMLFormElement, current: URLSearchParams): URLSearchParams {
  const data = new FormData(form);
  const next = new URLSearchParams(current);
  for (const name of [...FORM_PARAMS, ...PAGE_PARAMS]) next.delete(name);
  for (const name of FORM_PARAMS) {
    const value = data.get(name === 'maxTotal' ? 'maxPrice' : name);
    if (typeof value !== 'string' || value.trim() === '') continue;
    const text = value.trim();
    // An amount that does not parse is sent as typed, so the API reports it beside the field.
    const sent = name === 'maxTotal' ? String(toMinorUnits(text) ?? text) : text;
    next.set(name, ['origin', 'destination'].includes(name) ? sent.toUpperCase() : sent);
  }
  return next;
}

export function SearchForm({ params, errors, pending, onSearch }: SearchFormProps) {
  const value = (name: string, fallback = '') => params.get(name) ?? fallback;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(nextParams(event.currentTarget, params));
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="Search flights"
      className="flex flex-col gap-6 rounded-lg border p-4 sm:p-6"
    >
      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-2 text-base font-semibold">Where and when</legend>
        <Field id="origin" label="From" error={errors.origin}>
          {(control) => <AirportInput {...control} name="origin" defaultValue={value('origin')} />}
        </Field>
        <Field id="destination" label="To" error={errors.destination}>
          {(control) => (
            <AirportInput {...control} name="destination" defaultValue={value('destination')} />
          )}
        </Field>
        <Field id="date" label="Departure date" error={errors.date}>
          {(control) => (
            <input
              {...control}
              name="date"
              type="date"
              defaultValue={value('date')}
              className={INPUT_CLASS}
            />
          )}
        </Field>
        <Field
          id="returnDate"
          label="Return date (optional)"
          error={errors.returnDate}
          hint="Leave empty for a one-way trip."
        >
          {(control) => (
            <input
              {...control}
              name="returnDate"
              type="date"
              defaultValue={value('returnDate')}
              className={INPUT_CLASS}
            />
          )}
        </Field>
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <legend className="mb-2 text-base font-semibold">Passengers and cabin</legend>
        <Field id="adults" label="Adults" error={errors.adults} hint="12 years and over">
          {(control) => (
            <input
              {...control}
              name="adults"
              type="number"
              inputMode="numeric"
              min={0}
              max={9}
              defaultValue={value('adults', '1')}
              className={INPUT_CLASS}
            />
          )}
        </Field>
        <Field id="children" label="Children" error={errors.children} hint="2 to 11 years">
          {(control) => (
            <input
              {...control}
              name="children"
              type="number"
              inputMode="numeric"
              min={0}
              max={9}
              defaultValue={value('children', '0')}
              className={INPUT_CLASS}
            />
          )}
        </Field>
        <Field id="infants" label="Infants" error={errors.infants} hint="Under 2, on a lap">
          {(control) => (
            <input
              {...control}
              name="infants"
              type="number"
              inputMode="numeric"
              min={0}
              max={9}
              defaultValue={value('infants', '0')}
              className={INPUT_CLASS}
            />
          )}
        </Field>
        <Field id="cabin" label="Cabin" error={errors.cabin}>
          {(control) => (
            <select
              {...control}
              name="cabin"
              defaultValue={value('cabin', 'ECONOMY')}
              className={INPUT_CLASS}
            >
              <option value="ECONOMY">Economy</option>
              <option value="BUSINESS">Business</option>
            </select>
          )}
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-2 text-base font-semibold">Filters (optional)</legend>
        <Field
          id="maxPrice"
          label="Maximum total price (EGP)"
          error={errors.maxTotal}
          hint="For the whole party."
        >
          {(control) => (
            <input
              {...control}
              name="maxPrice"
              type="text"
              inputMode="decimal"
              defaultValue={fromMinorUnits(params.get('maxTotal'))}
              className={INPUT_CLASS}
            />
          )}
        </Field>
        <Field id="departFrom" label="Departing from" error={errors.departFrom}>
          {(control) => (
            <input
              {...control}
              name="departFrom"
              type="time"
              defaultValue={value('departFrom')}
              className={INPUT_CLASS}
            />
          )}
        </Field>
        <Field id="departTo" label="Departing until" error={errors.departTo}>
          {(control) => (
            <input
              {...control}
              name="departTo"
              type="time"
              defaultValue={value('departTo')}
              className={INPUT_CLASS}
            />
          )}
        </Field>
        <Field
          id="airlines"
          label="Airlines"
          error={errors.airlines}
          hint="Codes separated by commas, e.g. MS, BA"
        >
          {(control) => (
            <input
              {...control}
              name="airlines"
              type="text"
              autoComplete="off"
              maxLength={80}
              defaultValue={value('airlines')}
              className={`${INPUT_CLASS} uppercase`}
            />
          )}
        </Field>
      </fieldset>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="h-11 w-full rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60 sm:w-auto"
        >
          {pending ? 'Searching…' : 'Search flights'}
        </button>
      </div>
    </form>
  );
}
