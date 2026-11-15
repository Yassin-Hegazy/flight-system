import { PageHeading } from '@/components/page-parts';
import { PasswordForm, ProfileForm } from './profile-forms';

export default function AccountPage() {
  return (
    <>
      <PageHeading eyebrow="01 / Account & security" title="Your details. Your journey." />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <ProfileForm />
        <PasswordForm />
      </div>
    </>
  );
}
