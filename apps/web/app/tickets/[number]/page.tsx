import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TicketView } from './ticket-view';

export const metadata: Metadata = { title: 'E-ticket · aeron' };

export default function TicketPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-8 px-5 py-10 md:px-10 xl:px-[74px]">
      {/* The ticket is read in the browser from the number in the URL. */}
      <Suspense fallback={<p role="status">Loading the ticket…</p>}>
        <TicketView />
      </Suspense>
    </main>
  );
}
