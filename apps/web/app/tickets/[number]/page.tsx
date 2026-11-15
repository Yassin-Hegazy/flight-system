import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PAGE } from '@/components/page-parts';
import { TicketView } from './ticket-view';

export const metadata: Metadata = { title: 'E-ticket · aeron' };

export default function TicketPage() {
  return (
    <main className={PAGE}>
      {/* The ticket is read in the browser from the number in the URL. */}
      <Suspense fallback={<p role="status">Loading the ticket…</p>}>
        <TicketView />
      </Suspense>
    </main>
  );
}
