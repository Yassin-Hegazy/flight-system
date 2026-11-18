'use client';

import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { AirportInput } from './airport-input';
import type { ControlProps } from './field';

/** The query parameters the form owns. Filters, sort and pages belong to the results. */
const FORM_PARAMS = [
  'origin',
  'destination',
  'date',
  'returnDate',
  'adults',
  'children',
  'infants',
  'cabin',
];
/** A new trip starts with no filters and on the first page. */
const RESET_PARAMS = [
  'maxTotal',
  'departFrom',
  'departTo',
  'airlines',
  'page',
  'outboundPage',
  'inboundPage',
];
const PARTY_FIELDS = ['adults', 'children', 'infants', 'cabin'];

interface SearchFormProps {
  params: URLSearchParams;
  errors: Record<string, string>;
  pending: boolean;
  onSearch: (next: URLSearchParams) => void;
}

/** Builds the next URL from the form. Empty fields are left out, so the API applies its defaults. */
function nextParams(form: HTMLFormElement, current: URLSearchParams): URLSearchParams {
  const data = new FormData(form);
  const next = new URLSearchParams(current);
  for (const name of [...FORM_PARAMS, ...RESET_PARAMS]) next.delete(name);
  for (const name of FORM_PARAMS) {
    const value = data.get(name);
    if (typeof value !== 'string' || value.trim() === '') continue;
    const text = value.trim();
    next.set(name, ['origin', 'destination'].includes(name) ? text.toUpperCase() : text);
  }
  return next;
}

/** "ROUND TRIP / 2 ADULTS / ECONOMY", from what the URL asks for. */
function summary(params: URLSearchParams): string {
  const adults = Number(params.get('adults') ?? '1');
  const trip = params.get('returnDate') ? 'Round trip' : 'One way';
  const cabin = params.get('cabin') === 'BUSINESS' ? 'Business' : 'Economy';
  return `${trip}  /  ${adults} ${adults === 1 ? 'adult' : 'adults'}  /  ${cabin}`;
}

const CELL =
  'relative flex min-h-[62px] flex-col justify-center gap-[5px] border-b border-line px-[14px] py-2 ' +
  'focus-within:z-20 focus-within:shadow-[inset_0_0_0_3px_var(--color-pink)] ' +
  'lg:min-w-0 lg:flex-1 lg:border-b-0 lg:border-r';
const CONTROL =
  'w-full min-w-0 bg-transparent text-base leading-[1.3] font-bold text-navy outline-none ' +
  'placeholder:font-medium placeholder:text-navy-soft/70';

/**
 * The search as Figma's navy rail: one connected row of From, To, the dates and the travelers,
 * and the pink button. Errors from the API are shown inside their cell.
 */
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
      className="flex flex-col gap-4 rounded-[20px] bg-navy p-5 sm:px-[26px] sm:pt-4 sm:pb-6"
    >
      <p className="text-[11px] leading-none font-bold whitespace-pre-wrap text-mist uppercase">
        {summary(params)}
      </p>
      <div className="flex flex-col gap-[13px] lg:flex-row">
        <div className="flex flex-col rounded-[12px] bg-teal lg:flex-1 lg:flex-row">
          <RailCell id="origin" label="From" error={errors.origin}>
            {(control) => (
              <AirportInput
                {...control}
                name="origin"
                defaultValue={value('origin')}
                className={`${CONTROL} uppercase placeholder:normal-case`}
              />
            )}
          </RailCell>
          <RailCell id="destination" label="To" error={errors.destination}>
            {(control) => (
              <AirportInput
                {...control}
                name="destination"
                defaultValue={value('destination')}
                className={`${CONTROL} uppercase placeholder:normal-case`}
              />
            )}
          </RailCell>
          <RailCell id="date" label="Departure date" error={errors.date}>
            {(control) => (
              <input
                {...control}
                name="date"
                type="date"
                defaultValue={value('date')}
                className={CONTROL}
              />
            )}
          </RailCell>
          <RailCell id="returnDate" label="Return (optional)" error={errors.returnDate}>
            {(control) => (
              <input
                {...control}
                name="returnDate"
                type="date"
                defaultValue={value('returnDate')}
                className={CONTROL}
              />
            )}
          </RailCell>
          <Travelers params={params} errors={errors} />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="flex h-[62px] shrink-0 cursor-pointer items-center justify-center gap-3 rounded-[12px] bg-pink px-6 text-sm font-bold text-navy uppercase hover:brightness-105 focus-visible:outline-teal disabled:opacity-60 lg:w-[211px]"
        >
          {pending ? 'Searching…' : 'Search flights'}
          <span aria-hidden="true">↗</span>
        </button>
      </div>
    </form>
  );
}

interface RailCellProps {
  id: string;
  label: string;
  error?: string;
  className?: string;
  children: (control: ControlProps) => ReactNode;
}

/** One cell of the rail: a small label over its control, with the error right under it. */
function RailCell({ id, label, error, className, children }: RailCellProps) {
  const errorId = `${id}-error`;
  return (
    <div className={cn(CELL, className)}>
      <label htmlFor={id} className="text-[10px] leading-none font-bold text-navy-soft uppercase">
        {label}
      </label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : undefined,
      })}
      {error && (
        <p id={errorId} className="text-xs leading-tight font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const PARTY = [
  { name: 'adults', label: 'Adults', hint: '12 years and over', fallback: '1' },
  { name: 'children', label: 'Children', hint: '2 to 11 years', fallback: '0' },
  { name: 'infants', label: 'Infants', hint: 'Under 2, on a lap', fallback: '0' },
];
const PANEL_INPUT =
  'h-10 w-16 rounded-[10px] border border-line bg-white px-2 text-center text-sm font-bold ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ' +
  'aria-invalid:border-destructive';

/**
 * The travelers cell: a button opening a small panel with the party and the cabin. The panel is
 * hidden, never removed, so its fields are always sent with the form.
 */
function Travelers({
  params,
  errors,
}: {
  params: URLSearchParams;
  errors: Record<string, string>;
}) {
  const failed = PARTY_FIELDS.some((name) => errors[name]);
  const [open, setOpen] = useState(failed);
  const cell = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const total = PARTY.reduce(
    (sum, { name, fallback }) => sum + (Number(params.get(name) ?? fallback) || 0),
    0,
  );
  const cabin = params.get('cabin') === 'BUSINESS' ? 'Business' : 'Economy';

  useEffect(() => {
    if (!open) return;
    // On a click, not a pointerdown: on a phone the panel sits in the page, so closing it on
    // pointerdown would move the Search button out from under the finger before the click lands.
    const onClick = (event: MouseEvent) => {
      if (!cell.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={cell} className={cn(CELL, 'border-b-0 lg:border-r-0')}>
      <span
        id="travelers-label"
        className="text-[10px] leading-none font-bold text-navy-soft uppercase"
      >
        Travelers
      </span>
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls="travelers-panel"
        aria-labelledby="travelers-label travelers-value"
        onClick={() => setOpen((value) => !value)}
        className={`${CONTROL} cursor-pointer truncate text-left`}
      >
        <span id="travelers-value">
          {total} · {cabin}
        </span>
      </button>
      {failed && <p className="text-xs font-semibold text-danger">Check the travelers.</p>}
      <div
        id="travelers-panel"
        role="group"
        aria-label="Travelers and cabin"
        hidden={!open}
        className="mt-2 flex-col gap-4 rounded-[18px] bg-ice p-5 shadow-[0_24px_60px_-20px_rgb(7_45_80/0.6)] [&:not([hidden])]:flex lg:absolute lg:top-full lg:right-0 lg:z-40 lg:w-[320px]"
      >
        {PARTY.map(({ name, label, hint, fallback }) => (
          <div key={name} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={name}>
                <span className="block text-sm font-bold text-navy">{label}</span>
                <span className="block text-xs font-medium text-navy-soft">{hint}</span>
              </label>
              <input
                id={name}
                name={name}
                type="number"
                inputMode="numeric"
                min={0}
                max={9}
                defaultValue={params.get(name) ?? fallback}
                aria-invalid={errors[name] ? true : undefined}
                aria-describedby={errors[name] ? `${name}-error` : undefined}
                className={PANEL_INPUT}
              />
            </div>
            {errors[name] && (
              <p id={`${name}-error`} className="text-xs font-semibold text-danger">
                {errors[name]}
              </p>
            )}
          </div>
        ))}
        <div className="flex flex-col gap-2">
          <label htmlFor="cabin" className="text-sm font-bold text-navy">
            Cabin
          </label>
          <select
            id="cabin"
            name="cabin"
            defaultValue={params.get('cabin') ?? 'ECONOMY'}
            className="h-11 rounded-[12px] border border-line bg-white px-3 text-sm font-semibold text-navy"
          >
            <option value="ECONOMY">Economy</option>
            <option value="BUSINESS">Business</option>
          </select>
        </div>
      </div>
    </div>
  );
}
