import { PageHeading } from '@/components/page-parts';
import { Dashboard } from './dashboard';

export default function AdminDashboardPage() {
  return (
    <>
      <PageHeading eyebrow="Administration · Operations" title="Today in the air." />
      <Dashboard />
    </>
  );
}
