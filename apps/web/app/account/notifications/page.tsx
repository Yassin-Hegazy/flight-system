import { PageHeading } from '@/components/page-parts';
import { EmailPreferences, InboxView } from './inbox-view';

export default function NotificationsPage() {
  return (
    <>
      <PageHeading eyebrow="03 / What happened" title="Notifications" />
      <InboxView />
      <EmailPreferences />
    </>
  );
}
