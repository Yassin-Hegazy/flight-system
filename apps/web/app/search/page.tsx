import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchView } from './search-view';

export const metadata: Metadata = {
  title: 'Search flights · aeron',
};

/**
 * The static shell prerenders; the search itself reads the URL, so it sits in a Suspense boundary
 * (useSearchParams under Cache Components).
 */
export default function SearchPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-8 px-5 py-10 md:px-10 xl:px-[72px]">
      <Suspense
        fallback={
          <h1 className="text-[clamp(2.5rem,5vw,64px)] leading-none font-extrabold">
            Search flights
          </h1>
        }
      >
        <SearchView />
      </Suspense>
    </main>
  );
}
