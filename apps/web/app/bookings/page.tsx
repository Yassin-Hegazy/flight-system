import type { Metadata } from 'next';
import { PAGE, PageHeading } from '@/components/page-parts';
import { BookingsList } from './bookings-list';

export const metadata: Metadata = { title: 'My trips · aeron' };

export default function BookingsPage() {
  return (
    <main className={PAGE}>
      <PageHeading eyebrow="Your account" title="My trips" />
      <BookingsList />
    </main>
  );
}
