import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { SearchView } from './search-view';

export const metadata: Metadata = {
  title: 'Search flights · Flight Booking System',
};

/**
 * The static shell prerenders; the search itself reads the URL, so it sits in a Suspense boundary
 * (useSearchParams under Cache Components).
 */
export default function SearchPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href="/" className="underline underline-offset-4">
          Home
        </Link>
      </nav>
      <h1 className="text-3xl font-semibold tracking-tight">Search flights</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading the search form…</p>}>
        <SearchView />
      </Suspense>
    </main>
  );
}
