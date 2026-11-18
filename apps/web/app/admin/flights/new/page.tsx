import { PageHeading } from '@/components/page-parts';
import { CreateFlightForm } from './create-flight-form';

export default function NewFlightPage() {
  return (
    <>
      <PageHeading eyebrow="Administration · Flights" title="Create flight" />
      <CreateFlightForm />
    </>
  );
}
