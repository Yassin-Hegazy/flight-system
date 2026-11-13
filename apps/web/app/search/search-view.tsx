'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
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
      {search.data && <Results outcome={search.data} update={update} />}
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

function Results({ outcome, update }: { outcome: SearchOutcome; update: Update }) {
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
      />
      <ResultsSection
        id="inbound"
        title="Return"
        page={outcome.inbound}
        sortParam="inboundSort"
        pageParam="inboundPage"
        onChange={update}
        onClearFilters={clearFilters}
      />
    </div>
  );
}
