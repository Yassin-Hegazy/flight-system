'use client';

import { type FormEvent, useState } from 'react';
import { formText } from '@/lib/api';
import { fromMinorUnits, toMinorUnits } from '@/lib/format';
import { Field, INPUT_CLASS } from './field';

export const FILTER_PARAMS = ['maxTotal', 'departFrom', 'departTo', 'airlines'];
const PAGE_PARAMS = ['page', 'outboundPage', 'inboundPage'];

interface FiltersPanelProps {
  params: URLSearchParams;
  errors: Record<string, string>;
  /** Airline code → name, for every airline seen in this search's results. */
  airlines: Record<string, string>;
  /** The dearest total among the results, in minor units: the top of the price slider. */
  highestTotal: number;
  onChange: (updates: Record<string, string | null>) => void;
}

const SECTION = 'flex flex-col gap-3 border-t border-line pt-4';
const HEADING = 'text-[11px] leading-none font-bold text-navy-soft uppercase';

/**
 * "Refine your search": the price limit, the departure window and the airlines, sent to the API
 * as its filters. Every aeron flight is direct, so stops are stated rather than filtered.
 */
export function FiltersPanel({
  params,
  errors,
  airlines,
  highestTotal,
  onChange,
}: FiltersPanelProps) {
  const current = params.get('maxTotal');
  const [price, setPrice] = useState(fromMinorUnits(current));
  const chosen = new Set((params.get('airlines') ?? '').split(',').filter(Boolean));
  const ceiling = Math.max(
    1000,
    Math.ceil(Math.max(highestTotal, Number(current) || 0) / 100 / 1000) * 1000,
  );
  const active = FILTER_PARAMS.some((name) => params.has(name));

  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = price.trim();
    // An amount that does not parse is sent as typed, so the API reports it beside the field.
    const maxTotal = text ? String(toMinorUnits(text) ?? text) : null;
    const codes = data.getAll('airline').filter((code): code is string => typeof code === 'string');
    onChange({
      maxTotal,
      departFrom: formText(data, 'departFrom') || null,
      departTo: formText(data, 'departTo') || null,
      airlines: codes.length ? codes.join(',') : null,
      ...Object.fromEntries(PAGE_PARAMS.map((name) => [name, null])),
    });
  };
  const clear = () =>
    onChange(Object.fromEntries([...FILTER_PARAMS, ...PAGE_PARAMS].map((name) => [name, null])));

  return (
    <form
      onSubmit={apply}
      noValidate
      aria-label="Refine your search"
      className="flex flex-col gap-4 rounded-card border border-line bg-white p-5"
    >
      <h2 className="text-[21px] leading-tight font-bold">Refine your search</h2>

      <div className={SECTION}>
        <p className={HEADING}>Stops</p>
        <p className="text-sm font-semibold">
          Nonstop only{' '}
          <span className="font-normal text-navy-soft">· every aeron flight is direct</span>
        </p>
      </div>

      <div className={SECTION}>
        <p className={HEADING}>Price</p>
        <input
          type="range"
          aria-label="Price limit slider"
          min={0}
          max={ceiling}
          step={100}
          value={Number(price) || ceiling}
          onChange={(event) => setPrice(event.target.value)}
          className="w-full accent-pink"
        />
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
              inputMode="decimal"
              placeholder="No limit"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className={INPUT_CLASS}
            />
          )}
        </Field>
      </div>

      <div className={SECTION}>
        <p className={HEADING}>Departure time</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 xl:grid-cols-2">
          <Field id="departFrom" label="Departing from" error={errors.departFrom}>
            {(control) => (
              <input
                {...control}
                name="departFrom"
                type="time"
                defaultValue={params.get('departFrom') ?? ''}
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
                defaultValue={params.get('departTo') ?? ''}
                className={INPUT_CLASS}
              />
            )}
          </Field>
        </div>
      </div>

      <fieldset className={SECTION}>
        <legend className={`${HEADING} float-left mb-3 w-full`}>Airlines</legend>
        {Object.keys(airlines).length === 0 ? (
          <p className="text-sm text-navy-soft">No airlines to choose from yet.</p>
        ) : (
          Object.entries(airlines)
            .sort(([, a], [, b]) => a.localeCompare(b))
            .map(([code, name]) => (
              <label
                key={code}
                className="flex cursor-pointer items-center gap-3 text-sm font-semibold"
              >
                <input
                  type="checkbox"
                  name="airline"
                  value={code}
                  defaultChecked={chosen.has(code)}
                  className="size-[17px] cursor-pointer accent-pink"
                />
                {name} ({code})
              </label>
            ))
        )}
        {errors.airlines && <p className="text-sm text-destructive">{errors.airlines}</p>}
      </fieldset>

      <div className="flex flex-wrap gap-3 border-t border-line pt-4">
        <button
          type="submit"
          className="inline-flex h-11 cursor-pointer items-center rounded-full bg-navy px-5 text-[13px] font-bold text-white hover:bg-navy-soft"
        >
          Apply filters
        </button>
        {active && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex h-11 cursor-pointer items-center rounded-full border border-line bg-white px-5 text-xs font-bold text-navy hover:bg-teal"
          >
            Clear filters
          </button>
        )}
      </div>
    </form>
  );
}
