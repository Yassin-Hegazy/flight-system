'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { dayOf } from '@/lib/format';
import {
  type ApiErrorBody,
  runSearch,
  type SearchOutcome,
  SearchRequestError,
  type SearchResult,
} from '@/lib/search-api';
import { FILTER_PARAMS, FiltersPanel } from './filters-panel';
import { ResultsSection } from './results';
import { SearchForm } from './search-form';

const PAGE_PARAMS = ['page', 'outboundPage', 'inboundPage'];
/** Errors the form has a field for; any other one is shown above the form. */
const FORM_FIELDS = new Set([
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
]);

type Update = (updates: Record<string, string | null>) => void;

/**
 * The search page's interactive part. The URL is the state: the form writes the criteria into it,
 * the sort and pager change one parameter, and every change is one request to the API.
 */
export function SearchView() {
  const params = useSearchParams();
  const router = useRouter();
  const query = params.toString();

  const search = useQuery({
    queryKey: ['search', query],
    queryFn: () => runSearch(new URLSearchParams(query)),
    enabled: ['origin', 'destination', 'date'].every((name) => params.get(name)),
    retry: false,
  });

  const navigate = (next: URLSearchParams) =>
    router.push(`/search?${next.toString()}`, { scroll: false });
  const update: Update = (updates) => {
    const next = new URLSearchParams(query);
    for (const [name, value] of Object.entries(updates)) {
      if (value === null) next.delete(name);
      else next.set(name, value);
    }
    navigate(next);
  };

  const requestError = search.error instanceof SearchRequestError ? search.error.body : null;
  const errors = requestError?.fieldErrors ?? {};
  const found = search.data ? resultsOf(search.data) : [];
  // Every airline in any cached answer, so a ticked one stays offered when it filters to nothing.
  const client = useQueryClient();
  const airlines = Object.fromEntries(
    client
      .getQueriesData<SearchOutcome>({ queryKey: ['search'] })
      .flatMap(([, outcome]) => (outcome ? resultsOf(outcome) : []))
      .map((result) => [result.airline.code, result.airline.name]),
  );

  return (
    <div className="flex flex-col gap-8">
      <SearchForm
        key={query}
        params={new URLSearchParams(query)}
        errors={errors}
        pending={search.isFetching}
        onSearch={navigate}
      />
      <ErrorBanner failed={search.isError} requestError={requestError} />
      <Heading params={params} results={found} />
      {search.isFetching && !search.data && (
        <p role="status" className="text-sm text-muted-foreground">
          Searching…
        </p>
      )}
      {search.data && (
        <div className="grid items-start gap-6 lg:grid-cols-[252px_minmax(0,1fr)]">
          <FiltersPanel
            key={`filters-${query}`}
            params={params}
            errors={errors}
            airlines={airlines}
            highestTotal={Math.max(0, ...found.map((result) => result.total.amountMinor))}
            onChange={update}
          />
          <Results
            key={`results-${query}`}
            outcome={search.data}
            update={update}
            party={partyOf(params)}
          />
        </div>
      )}
    </div>
  );
}

function resultsOf(outcome: SearchOutcome): SearchResult[] {
  return outcome.kind === 'one-way'
    ? outcome.page.items
    : [...outcome.outbound.items, ...outcome.inbound.items];
}

/** The route's city names from the results, or its codes while there are none. */
function cities(results: SearchResult[], origin: string, destination: string): [string, string] {
  const leg = results.find((result) => result.origin.code === origin);
  return leg ? [leg.origin.city, leg.destination.city] : [origin, destination];
}

/** Adults, children and infants together, with the API's defaults. */
function partySize(params: URLSearchParams): number {
  return ['adults', 'children', 'infants'].reduce(
    (sum, name) => sum + (Number(params.get(name) ?? (name === 'adults' ? '1' : '0')) || 0),
    0,
  );
}

/** "Cairo → London" once a route is searched, with the dates and the party under it. */
function Heading({ params, results }: { params: URLSearchParams; results: SearchResult[] }) {
  const origin = params.get('origin');
  const destination = params.get('destination');
  const date = params.get('date');
  if (!origin || !destination || !date) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-xs leading-none font-bold text-navy-soft">01 / THE TAKEOFF</p>
        <h1 className="text-[clamp(2.5rem,5vw,64px)] leading-none font-extrabold">
          Search flights
        </h1>
      </div>
    );
  }
  const [from, to] = cities(results, origin, destination);
  const returnDate = params.get('returnDate');
  const people = partySize(params);
  const dates = returnDate ? `${dayOf(date)} – ${dayOf(returnDate)}` : dayOf(date);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] leading-none font-bold text-navy-soft uppercase">
        Flight search / results
      </p>
      <h1 className="text-[clamp(2.25rem,4.5vw,42px)] leading-none font-extrabold">
        {from} → {to}
      </h1>
      <p className="text-base text-navy-soft">
        {dates} · {people} {people === 1 ? 'passenger' : 'passengers'} ·{' '}
        {returnDate ? 'Round trip' : 'One way'}
      </p>
    </div>
  );
}

const ALERT_CLASS = 'rounded-md border border-destructive p-3 text-sm text-destructive';

/** Errors that belong to no form field (an unknown airport, a bad sort), or an outage. */
function ErrorBanner({
  failed,
  requestError,
}: {
  failed: boolean;
  requestError: ApiErrorBody | null;
}) {
  if (!failed) return null;
  if (!requestError) {
    return (
      <p role="alert" className={ALERT_CLASS}>
        Search is unavailable right now. Please try again.
      </p>
    );
  }
  const placed = Object.keys(requestError.fieldErrors ?? {}).some((name) => FORM_FIELDS.has(name));
  if (placed) return null;
  return (
    <p role="alert" className={ALERT_CLASS}>
      {requestError.message}
    </p>
  );
}

/** The party and cabin of this search, with the API's defaults filled in. */
function partyOf(params: URLSearchParams): string {
  return new URLSearchParams({
    adults: params.get('adults') ?? '1',
    children: params.get('children') ?? '0',
    infants: params.get('infants') ?? '0',
    cabin: params.get('cabin') ?? 'ECONOMY',
  }).toString();
}

interface ResultsProps {
  outcome: SearchOutcome;
  update: Update;
  party: string;
}

function Results({ outcome, update, party }: ResultsProps) {
  // A round trip is booked as a pair: one flight chosen from each list.
  const [picked, setPicked] = useState<{ outbound: string | null; inbound: string | null }>({
    outbound: null,
    inbound: null,
  });
  const clearFilters = () =>
    update(Object.fromEntries([...FILTER_PARAMS, ...PAGE_PARAMS].map((name) => [name, null])));

  if (outcome.kind === 'one-way') {
    return (
      <ResultsSection
        id="flights"
        title="Flights"
        page={outcome.page}
        sortParam="sort"
        pageParam="page"
        onChange={update}
        onClearFilters={clearFilters}
        party={party}
      />
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <ResultsSection
        id="outbound"
        title="Outbound"
        page={outcome.outbound}
        sortParam="outboundSort"
        pageParam="outboundPage"
        onChange={update}
        onClearFilters={clearFilters}
        party={party}
        selection={{
          selectedId: picked.outbound,
          onSelect: (outbound) => setPicked((current) => ({ ...current, outbound })),
        }}
      />
      <ResultsSection
        id="inbound"
        title="Return"
        page={outcome.inbound}
        sortParam="inboundSort"
        pageParam="inboundPage"
        onChange={update}
        onClearFilters={clearFilters}
        party={party}
        selection={{
          selectedId: picked.inbound,
          onSelect: (inbound) => setPicked((current) => ({ ...current, inbound })),
        }}
      />
      <div className="flex flex-wrap items-center gap-4 rounded-card bg-navy p-5 text-white">
        {picked.outbound && picked.inbound ? (
          <Link
            href={`/book?flightId=${picked.outbound}&returnFlightId=${picked.inbound}&${party}`}
            className="inline-flex h-[52px] items-center gap-2 rounded-full bg-pink px-8 text-[15px] font-bold text-navy hover:brightness-105 focus-visible:outline-teal"
          >
            Continue to booking <span aria-hidden="true">↗</span>
          </Link>
        ) : (
          <p role="status" className="text-sm font-bold text-teal">
            Select an outbound and a return flight to book them together.
          </p>
        )}
      </div>
    </div>
  );
}
