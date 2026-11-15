import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PAGE } from '@/components/page-parts';
import { BookingView } from './booking-view';

export const metadata: Metadata = { title: 'Booking · aeron' };

export default function BookingPage() {
  return (
    <main className={PAGE}>
      {/* The booking is read in the browser from the reference in the URL. */}
      <Suspense fallback={<p role="status">Loading your booking…</p>}>
        <BookingView />
      </Suspense>
    </main>
  );
}
