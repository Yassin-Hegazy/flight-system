import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PayView } from './pay-view';

export const metadata: Metadata = { title: 'Payment · aeron' };

export default function PayPage() {
  return (
    <main className="mx-auto flex w-full max-w-[880px] flex-1 flex-col gap-8 px-5 py-10 md:px-10">
      {/* The booking is read in the browser from the reference in the URL. */}
      <Suspense fallback={<p role="status">Loading your booking…</p>}>
        <PayView />
      </Suspense>
    </main>
  );
}
