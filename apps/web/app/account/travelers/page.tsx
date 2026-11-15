import { PageHeading } from '@/components/page-parts';
import { TravelersView } from './travelers-view';

export default function TravelersPage() {
  return (
    <>
      <PageHeading eyebrow="02 / Your travel companions" title="The people you fly with." />
      <TravelersView />
    </>
  );
}
