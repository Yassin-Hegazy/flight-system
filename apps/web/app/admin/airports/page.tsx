import { PageHeading } from '@/components/page-parts';
import { AirportsView } from './airports-view';

export default function AdminAirportsPage() {
  return (
    <>
      <PageHeading eyebrow="Administration · Airports" title="Airports" />
      <AirportsView />
    </>
  );
}
