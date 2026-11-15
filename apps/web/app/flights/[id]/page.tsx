import type { Metadata } from 'next';
import { Suspense } from 'react';
import { FlightView } from './flight-view';

export const metadata: Metadata = { title: 'Flight · aeron' };

/** The flight is read in the browser from the id in the URL, so the view sits in Suspense. */
export default function FlightPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-8 px-5 py-10 md:px-10 xl:px-[72px]">
      <Suspense fallback={<p role="status">Loading the flight…</p>}>
        <FlightView />
      </Suspense>
    </main>
  );
}
