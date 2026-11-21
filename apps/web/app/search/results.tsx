'use client';

import Link from 'next/link';
import { dayOf, describeLine, formatDuration, formatMoney, timeOf } from '@/lib/format';
import { type ResultPage, type SearchResult, SORT_OPTIONS } from '@/lib/search-api';
import { INPUT_CLASS } from './field';

const BUTTON_CLASS =
  'h-11 cursor-pointer rounded-full border border-navy/25 px-5 text-sm font-bold hover:border-navy ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

interface ResultsSectionProps {
  /** "outbound", "inbound" or "flights": used for headings and element IDs. */
  id: string;
  title: string;
  page: ResultPage;
  sortParam: string;
  pageParam: string;
  onChange: (updates: Record<string, string | null>) => void;
  onClearFilters: () => void;
  /** adults, children, infants and cabin as a query string, carried to the flight and booking pages. */
  party: string;
  /** Round trip only: this list's chosen flight, and how to choose one. One-way lists book directly. */
  selection?: { selectedId: string | null; onSelect: (flightId: string) => void };
}

/**
 * One list of results. It only renders the ResultPage the API returned: the order, the count and
 * the prices all come from the API (pack section 10). Changing the sort or the page asks the API
 * again through the URL.
 */
export function ResultsSection(props: ResultsSectionProps) {
  const { id, title, page, sortParam, pageParam, onChange, onClearFilters, party, selection } =
    props;
  const headingId = `${id}-heading`;
  const filtered = Object.keys(page.filters).length > 0;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id={headingId} className="text-2xl font-extrabold">
            {title}
          </h2>
          <p role="status" className="text-[13px] font-semibold text-navy-soft">
            {page.total === 1 ? '1 flight' : `${page.total} flights`}
          </p>
        </div>
        <div className="flex flex-col gap-1 sm:w-56">
          <label htmlFor={`${id}-sort`} className="text-sm font-medium">
            Sort by
          </label>
          <select
            id={`${id}-sort`}
            value={page.sort}
            onChange={(event) => onChange({ [sortParam]: event.target.value, [pageParam]: null })}
            className={INPUT_CLASS}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {page.total === 0 ? (
        <EmptyState filtered={filtered} onClearFilters={onClearFilters} />
      ) : (
        <ol className="flex flex-col gap-3" aria-label={`${title} results`}>
          {page.items.map((result) => (
            <li key={result.flightId}>
              <ResultCard result={result} party={party} selection={selection} />
            </li>
          ))}
        </ol>
      )}

      {page.total > 0 && (
        <nav aria-label={`${title} pages`} className="flex items-center justify-between gap-2">
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={page.page <= 1}
            onClick={() => onChange({ [pageParam]: String(page.page - 1) })}
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">Page {page.page}</span>
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={!page.hasNext}
            onClick={() => onChange({ [pageParam]: String(page.page + 1) })}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}

function EmptyState({
  filtered,
  onClearFilters,
}: {
  filtered: boolean;
  onClearFilters: () => void;
}) {
  if (!filtered) {
    return (
      <div className="rounded-card border border-dashed border-line bg-white p-6 text-center">
        <p className="font-medium">No flights on this day</p>
        <p className="text-sm text-muted-foreground">Try another date or route.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line bg-white p-6 text-center">
      <p className="font-medium">No flights match these filters</p>
      <button type="button" className={BUTTON_CLASS} onClick={onClearFilters}>
        Clear filters
      </button>
    </div>
  );
}

const CABIN_LABEL = { ECONOMY: 'Economy', BUSINESS: 'Business' } as const;

const ACTION =
  'inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full px-5 text-[13px] font-bold ' +
  'focus-visible:outline-navy';

interface ResultCardProps {
  result: SearchResult;
  party: string;
  selection?: ResultsSectionProps['selection'];
}

function ResultCard({ result, party, selection }: ResultCardProps) {
  const chosen = selection?.selectedId === result.flightId;
  const stops =
    result.stops === 0 ? 'Direct' : `${result.stops} stop${result.stops > 1 ? 's' : ''}`;
  return (
    <article
      aria-label={`${result.flightNumber}, ${result.airline.name}`}
      className={`grid gap-5 rounded-card border bg-white p-5 sm:grid-cols-[160px_minmax(0,1fr)] xl:grid-cols-[160px_minmax(0,1fr)_auto] xl:items-center ${chosen ? 'border-navy shadow-[inset_0_0_0_2px_var(--color-navy)]' : 'border-line'}`}
      data-testid="search-result"
    >
      <div className="flex flex-col justify-center gap-1 rounded-inset bg-navy px-[19px] py-3 text-white sm:min-h-[86px]">
        <p className="text-lg leading-tight font-extrabold">{result.airline.name}</p>
        <p className="text-[11px] font-bold text-teal uppercase">
          {result.flightNumber} · {CABIN_LABEL[result.cabin]}
        </p>
      </div>

      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <p className="flex flex-col">
          <time
            dateTime={result.departureLocal}
            className="text-[28px] leading-none font-extrabold"
          >
            {timeOf(result.departureLocal)}
          </time>
          <span className="mt-2 pl-1 text-[13px] font-bold text-navy-soft">
            {result.origin.code}
          </span>
        </p>
        <p className="flex flex-col items-center text-center">
          <span aria-hidden="true" className="text-[30px] leading-none font-bold text-navy-soft">
            →
          </span>
          <span className="sr-only">to</span>
          <span className="mt-1 text-xs font-medium text-navy-soft">
            {stops} · {formatDuration(result.durationMinutes)}
          </span>
        </p>
        <p className="flex flex-col items-end sm:items-start">
          <time dateTime={result.arrivalLocal} className="text-[28px] leading-none font-extrabold">
            {timeOf(result.arrivalLocal)}
          </time>
          <span className="mt-2 pl-1 text-[13px] font-bold text-navy-soft">
            {result.destination.code}
          </span>
        </p>
        <p className="col-span-3 text-xs font-medium text-navy-soft">
          {dayOf(result.departureLocal)}
          {result.estimatedDepartureLocal && (
            <span className="font-bold text-navy">
              {' '}
              · Delayed: now departs{' '}
              <time dateTime={result.estimatedDepartureLocal}>
                {timeOf(result.estimatedDepartureLocal)}
              </time>{' '}
              (scheduled {timeOf(result.departureLocal)})
            </span>
          )}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between xl:col-span-1 xl:flex-col xl:items-end">
        <div className="xl:text-right">
          <p className="text-[28px] leading-none font-extrabold" data-testid="result-total">
            {formatMoney(result.total)}
          </p>
          <p className="mt-1 text-xs text-navy-soft">
            Total · {formatMoney(result.adultFare)} per adult
          </p>
          <ul className="text-xs text-navy-soft" aria-label="Price breakdown">
            {result.breakdown.map((line) => (
              <li key={line.passengerType}>
                {describeLine(line)} = {formatMoney(line.amount)}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/flights/${result.flightId}?${party}`}
            aria-label={`View flight ${result.flightNumber}`}
            className={`${ACTION} border border-line bg-white hover:border-navy`}
          >
            Details
          </Link>
          {selection ? (
            <button
              type="button"
              aria-pressed={chosen}
              aria-label={`Select ${result.flightNumber}`}
              onClick={() => selection.onSelect(result.flightId)}
              className={`${ACTION} ${chosen ? 'bg-teal text-navy shadow-[inset_0_0_0_2px_var(--color-navy)]' : 'bg-navy text-white hover:bg-navy-soft'}`}
            >
              {chosen ? 'Selected ✓' : 'Select flight'}
            </button>
          ) : (
            <Link
              href={`/book?flightId=${result.flightId}&${party}`}
              aria-label={`Book ${result.flightNumber}`}
              className={`${ACTION} bg-navy text-white hover:bg-navy-soft`}
            >
              Select flight <span aria-hidden="true">↗</span>
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
