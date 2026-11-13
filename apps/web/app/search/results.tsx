'use client';

import { dayOf, describeLine, formatDuration, formatMoney, timeOf } from '@/lib/format';
import { type ResultPage, type SearchResult, SORT_OPTIONS } from '@/lib/search-api';
import { INPUT_CLASS } from './field';

const BUTTON_CLASS =
  'h-10 rounded-md border px-4 text-sm font-medium hover:bg-accent ' +
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
}

/**
 * One list of results. It only renders the ResultPage the API returned: the order, the count and
 * the prices all come from the API (pack section 10). Changing the sort or the page asks the API
 * again through the URL.
 */
export function ResultsSection(props: ResultsSectionProps) {
  const { id, title, page, sortParam, pageParam, onChange, onClearFilters } = props;
  const headingId = `${id}-heading`;
  const filtered = Object.keys(page.filters).length > 0;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id={headingId} className="text-xl font-semibold">
            {title}
          </h2>
          <p role="status" className="text-sm text-muted-foreground">
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
              <ResultCard result={result} />
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
      <div className="rounded-lg border border-dashed p-6 text-center">
        <p className="font-medium">No flights on this day</p>
        <p className="text-sm text-muted-foreground">Try another date or route.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-center">
      <p className="font-medium">No flights match these filters</p>
      <button type="button" className={BUTTON_CLASS} onClick={onClearFilters}>
        Clear filters
      </button>
    </div>
  );
}

const CABIN_LABEL = { ECONOMY: 'Economy', BUSINESS: 'Business' } as const;

function ResultCard({ result }: { result: SearchResult }) {
  return (
    <article
      aria-label={`${result.flightNumber}, ${result.airline.name}`}
      className="grid gap-4 rounded-lg border p-4 sm:grid-cols-[1fr_auto] sm:items-center"
      data-testid="search-result"
    >
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{result.flightNumber}</span> ·{' '}
          {result.airline.name} · {CABIN_LABEL[result.cabin]}
        </p>
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-lg font-semibold">
            <time dateTime={result.departureLocal}>{timeOf(result.departureLocal)}</time>{' '}
            {result.origin.code}
          </span>
          <span aria-hidden="true">→</span>
          <span className="sr-only">to</span>
          <span className="text-lg font-semibold">
            <time dateTime={result.arrivalLocal}>{timeOf(result.arrivalLocal)}</time>{' '}
            {result.destination.code}
          </span>
        </p>
        <p className="text-sm text-muted-foreground">
          {dayOf(result.departureLocal)} · {formatDuration(result.durationMinutes)} ·{' '}
          {result.stops === 0 ? 'Direct' : `${result.stops} stop${result.stops > 1 ? 's' : ''}`}
        </p>
        {result.estimatedDepartureLocal && (
          <p className="text-sm font-medium">
            Delayed: now departs{' '}
            <time dateTime={result.estimatedDepartureLocal}>
              {timeOf(result.estimatedDepartureLocal)}
            </time>{' '}
            (scheduled {timeOf(result.departureLocal)})
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1 sm:items-end sm:text-right">
        <p className="text-xl font-bold" data-testid="result-total">
          {formatMoney(result.total)}
        </p>
        <p className="text-xs text-muted-foreground">
          Total for all passengers · {formatMoney(result.adultFare)} per adult
        </p>
        <ul className="text-xs text-muted-foreground" aria-label="Price breakdown">
          {result.breakdown.map((line) => (
            <li key={line.passengerType}>
              {describeLine(line)} = {formatMoney(line.amount)}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
