import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BookingForm } from './booking-form';

export const metadata: Metadata = { title: 'Passengers · aeron' };

export default function BookPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-8 px-5 py-10 md:px-10 xl:px-[72px]">
      <div className="flex flex-col gap-4">
        <p className="text-xs leading-none font-bold text-navy-soft">02 / WHO IS FLYING</p>
        <h1 className="text-[clamp(2.5rem,5vw,64px)] leading-none font-extrabold">Passengers</h1>
      </div>
      {/* The trip is read from the URL, so the form sits in Suspense (Cache Components). */}
      <Suspense fallback={<p role="status">Loading your trip…</p>}>
        <BookingForm />
      </Suspense>
    </main>
  );
}
