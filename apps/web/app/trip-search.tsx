'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { AirportInput } from './search/airport-input';

type Trip = 'round' | 'oneway';
type Party = { adults: number; children: number; infants: number };
type Cabin = 'ECONOMY' | 'BUSINESS';

const REQUIRED = [
  ['origin', 'rail-origin', 'Choose where you are flying from.'],
  ['destination', 'rail-destination', 'Choose where you are flying to.'],
  ['date', 'rail-date', 'Choose a departure date.'],
] as const;

const CELL =
  'relative flex min-h-[91px] flex-col justify-center gap-2 border-b border-mist/70 px-[18px] py-[15px] ' +
  'last:border-b-0 focus-within:z-20 focus-within:shadow-[inset_0_0_0_3px_var(--color-pink)] ' +
  'lg:min-w-0 lg:flex-1 lg:border-b-0 lg:border-r lg:last:border-r-0';
const LABEL = 'text-[10px] leading-none font-bold text-navy-soft uppercase';
const CONTROL =
  'w-full min-w-0 bg-transparent text-base leading-[1.3] font-bold text-navy outline-none ' +
  'placeholder:font-medium placeholder:text-navy-soft/70';

/**
 * The landing page's search rail. It only collects the trip and hands it to /search as query
 * parameters, the same ones the API takes; the search itself, its errors and filters live there.
 */
export function TripSearch() {
  const router = useRouter();
  const [trip, setTrip] = useState<Trip>('round');
  const [party, setParty] = useState<Party>({ adults: 1, children: 0, infants: 0 });
  const [cabin, setCabin] = useState<Cabin>('ECONOMY');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = data.get(name);
      return typeof value === 'string' ? value.trim() : '';
    };

    const missing = REQUIRED.filter(([name]) => !text(name));
    setErrors(Object.fromEntries(missing.map(([name, , message]) => [name, message])));
    const first = missing[0];
    if (first) {
      document.getElementById(first[1])?.focus();
      return;
    }

    const next = new URLSearchParams({
      origin: text('origin').toUpperCase(),
      destination: text('destination').toUpperCase(),
      date: text('date'),
    });
    if (trip === 'round' && text('returnDate')) next.set('returnDate', text('returnDate'));
    for (const [name, count] of Object.entries(party)) next.set(name, String(count));
    next.set('cabin', cabin);
    router.push(`/search?${next.toString()}`);
  };

  return (
    <section
      id="search"
      aria-labelledby="search-title"
      className="relative scroll-mt-6 rounded-[32px] bg-navy px-5 pt-7 pb-7 sm:px-8 lg:pr-[56px] lg:pl-[34px]"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-4">
          <p className="text-[11px] leading-none font-bold text-mist">01 / THE TAKEOFF</p>
          <h2
            id="search-title"
            className="text-[clamp(2rem,3.5vw,39px)] leading-none font-extrabold text-white"
          >
            Where to next?
          </h2>
        </div>
        <TripToggle value={trip} onChange={setTrip} />
      </div>

      <form
        noValidate
        onSubmit={submit}
        aria-label="Find a flight"
        className="mt-7 flex flex-col gap-[13px] lg:flex-row"
      >
        <div className="flex flex-col rounded-[14px] bg-teal lg:flex-1 lg:flex-row">
          <Cell
            id="rail-origin"
            label="From"
            error={errors.origin}
            className="rounded-t-[14px] lg:rounded-l-[14px] lg:rounded-tr-none"
          >
            {(control) => (
              <AirportInput
                {...control}
                name="origin"
                defaultValue=""
                className={`${CONTROL} uppercase placeholder:normal-case`}
              />
            )}
          </Cell>
          <Cell id="rail-destination" label="To" error={errors.destination}>
            {(control) => (
              <AirportInput
                {...control}
                name="destination"
                defaultValue=""
                className={`${CONTROL} uppercase placeholder:normal-case`}
              />
            )}
          </Cell>
          <Cell id="rail-date" label="Depart" error={errors.date}>
            {(control) => <input {...control} name="date" type="date" className={CONTROL} />}
          </Cell>
          {trip === 'round' ? (
            <Cell id="rail-return" label="Return">
              {(control) => (
                <input {...control} name="returnDate" type="date" className={CONTROL} />
              )}
            </Cell>
          ) : (
            <div className={CELL}>
              <span className={LABEL}>Return</span>
              <button
                type="button"
                onClick={() => setTrip('round')}
                className={`${CONTROL} cursor-pointer text-left text-navy-soft`}
              >
                + Add return
              </button>
            </div>
          )}
          <Travelers party={party} cabin={cabin} onParty={setParty} onCabin={setCabin} />
        </div>

        <button
          type="submit"
          className="flex h-16 shrink-0 cursor-pointer items-center justify-center gap-3 rounded-[14px] bg-pink px-6 text-[18px] leading-tight font-extrabold text-navy transition-[filter] hover:brightness-105 focus-visible:outline-teal lg:h-[91px] lg:w-[192px]"
        >
          <span className="lg:max-w-[5.5em] lg:text-center">SEARCH FLIGHTS</span>
          <span aria-hidden="true">↗</span>
        </button>
      </form>
    </section>
  );
}

interface CellProps {
  id: string;
  label: string;
  error?: string;
  className?: string;
  children: (control: {
    id: string;
    'aria-invalid'?: true;
    'aria-describedby'?: string;
  }) => ReactNode;
}

/** One cell of the rail: a small label over its control, with the error right under it. */
function Cell({ id, label, error, className, children }: CellProps) {
  const errorId = `${id}-error`;
  return (
    <div className={cn(CELL, className)}>
      <label htmlFor={id} className={LABEL}>
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

function TripToggle({ value, onChange }: { value: Trip; onChange: (trip: Trip) => void }) {
  const options: { value: Trip; label: string }[] = [
    { value: 'round', label: 'Round trip' },
    { value: 'oneway', label: 'One way' },
  ];
  return (
    <div role="radiogroup" aria-label="Trip type" className="flex items-center gap-2 lg:mt-[13px]">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              if (!event.key.startsWith('Arrow')) return;
              event.preventDefault();
              onChange(value === 'round' ? 'oneway' : 'round');
              event.currentTarget.parentElement
                ?.querySelector<HTMLElement>('[aria-checked="false"]')
                ?.focus();
            }}
            className={cn(
              'h-[34px] cursor-pointer rounded-full px-[15px] text-xs leading-none font-bold uppercase transition-colors focus-visible:outline-teal',
              selected ? 'bg-pink text-navy' : 'text-white hover:text-pink',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const PARTY_ROWS: { key: keyof Party; label: string; plural: string; hint: string; min: number }[] =
  [
    { key: 'adults', label: 'Adults', plural: 'adults', hint: '12 years and over', min: 1 },
    { key: 'children', label: 'Children', plural: 'children', hint: '2 to 11 years', min: 0 },
    { key: 'infants', label: 'Infants', plural: 'infants', hint: 'Under 2, on a lap', min: 0 },
  ];
const MAX_PARTY = 9;

interface TravelersProps {
  party: Party;
  cabin: Cabin;
  onParty: (party: Party) => void;
  onCabin: (cabin: Cabin) => void;
}

/** The travelers cell: a button that opens a small panel with a stepper per age group and the cabin. */
function Travelers({ party, cabin, onParty, onCabin }: TravelersProps) {
  const [open, setOpen] = useState(false);
  const cell = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const total = party.adults + party.children + party.infants;

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!cell.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const stepper =
    'grid size-10 cursor-pointer place-items-center rounded-full bg-navy text-xl leading-none font-bold text-teal disabled:cursor-not-allowed disabled:opacity-30';

  return (
    <div ref={cell} className={cn(CELL, 'rounded-b-[14px] lg:rounded-r-[14px] lg:rounded-bl-none')}>
      <span id="rail-travelers-label" className={LABEL}>
        Travelers
      </span>
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls="rail-travelers-panel"
        aria-labelledby="rail-travelers-label rail-travelers-value"
        onClick={() => setOpen((value) => !value)}
        className={`${CONTROL} cursor-pointer truncate text-left`}
      >
        <span id="rail-travelers-value">
          {total} · {cabin === 'ECONOMY' ? 'Economy' : 'Business'}
        </span>
      </button>
      {open && (
        <div
          id="rail-travelers-panel"
          role="group"
          aria-label="Travelers and cabin"
          className="absolute top-full right-0 left-0 z-40 mt-2 flex flex-col gap-4 rounded-[18px] bg-ice p-5 shadow-[0_24px_60px_-20px_rgb(7_45_80/0.6)] lg:left-auto lg:w-[300px]"
        >
          {PARTY_ROWS.map(({ key, label, plural, hint, min }) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-navy">{label}</p>
                <p className="text-xs font-medium text-navy-soft">{hint}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label={`Fewer ${plural}`}
                  disabled={party[key] <= min}
                  onClick={() => onParty({ ...party, [key]: party[key] - 1 })}
                  className={stepper}
                >
                  −
                </button>
                <span aria-live="polite" className="w-4 text-center text-base font-bold text-navy">
                  {party[key]}
                </span>
                <button
                  type="button"
                  aria-label={`More ${plural}`}
                  disabled={total >= MAX_PARTY}
                  onClick={() => onParty({ ...party, [key]: party[key] + 1 })}
                  className={stepper}
                >
                  +
                </button>
              </div>
            </div>
          ))}
          <div className="flex flex-col gap-2">
            <label htmlFor="rail-cabin" className="text-sm font-bold text-navy">
              Cabin
            </label>
            <select
              id="rail-cabin"
              value={cabin}
              onChange={(event) => onCabin(event.target.value as Cabin)}
              className="h-11 rounded-[12px] border border-line bg-white px-3 text-sm font-semibold text-navy"
            >
              <option value="ECONOMY">Economy</option>
              <option value="BUSINESS">Business</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
