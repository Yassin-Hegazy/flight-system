import { PageHeading } from '@/components/page-parts';
import { RecurringForm } from './recurring-form';

export default function RecurringFlightsPage() {
  return (
    <>
      <PageHeading eyebrow="Administration · Flights" title="Recurring flights" />
      <p className="-mt-4 max-w-[65ch] text-[17px] font-medium text-navy-soft">
        Schedule the same flight on chosen weekdays between two dates, up to 90 days apart. The
        whole series is created together, or not at all.
      </p>
      <RecurringForm />
    </>
  );
}
