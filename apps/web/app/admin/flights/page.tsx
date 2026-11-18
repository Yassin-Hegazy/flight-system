import Link from 'next/link';
import { Suspense } from 'react';
import { PageHeading } from '@/components/page-parts';
import { PINK_BUTTON } from '../admin-parts';
import { FlightsView } from './flights-view';

export default function AdminFlightsPage() {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeading eyebrow="Administration · Flights" title="Every flight, in order." />
        <Link href="/admin/flights/new" className={PINK_BUTTON}>
          Create a flight <span aria-hidden="true">↗</span>
        </Link>
      </div>
      <Suspense fallback={<p role="status">Loading flights…</p>}>
        <FlightsView />
      </Suspense>
    </>
  );
}
