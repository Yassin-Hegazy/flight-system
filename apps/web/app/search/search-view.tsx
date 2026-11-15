'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import {
  type ApiErrorBody,
  runSearch,
  type SearchOutcome,
  SearchRequestError,
} from '@/lib/search-api';
import { ResultsSection } from './results';
import { SearchForm } from './search-form';

const FILTER_PARAMS = ['maxTotal', 'departFrom', 'departTo', 'airlines'];
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

  return (
    <div className="flex flex-col gap-8">
      <ErrorBanner failed={search.isError} requestError={requestError} />
      <SearchForm
        key={query}
        params={new URLSearchParams(query)}
        errors={requestError?.fieldErrors ?? {}}
        pending={search.isFetching}
        onSearch={navigate}
      />
      {search.isFetching && !search.data && (
        <p role="status" className="text-sm text-muted-foreground">
          Searching…
        </p>
      )}
      {search.data && (
        <Results
          key={`results-${query}`}
          outcome={search.data}
          update={update}
          party={partyOf(params)}
        />
      )}
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
    <div className="grid gap-8 lg:grid-cols-2">
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
      <div className="flex flex-wrap items-center gap-4 rounded-[18px] bg-navy p-5 text-white lg:col-span-2">
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
