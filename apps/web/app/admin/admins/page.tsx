import { PageHeading } from '@/components/page-parts';
import { CreateAdministratorForm } from './create-administrator-form';

const SCOPE = [
  'Manage flights and fares',
  'Maintain airport records',
  'Review administrative audit logs',
  'Create other administrators',
];

export default function AdminUsersPage() {
  return (
    <>
      <div className="flex flex-col gap-4">
        <PageHeading eyebrow="Administration · Access" title="Access is a responsibility." />
        <p className="max-w-[60ch] text-[17px] font-medium text-navy-soft">
          Give trusted teammates administrator access through a controlled setup.
        </p>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_324px]">
        <CreateAdministratorForm />
        <aside aria-label="What administrators can do" className="flex flex-col gap-6">
          <section className="rounded-card bg-navy p-6 text-white">
            <p className="mt-6 text-[11px] leading-none font-bold text-mist">ACCESS / ADMIN</p>
            <h2 className="mt-4 text-[29px] leading-tight font-extrabold">
              Power, with accountability.
            </h2>
            <ul className="mt-8 flex flex-col gap-4 pb-4">
              {SCOPE.map((item) => (
                <li key={item} className="flex items-center gap-3 text-[13px] font-semibold">
                  <span aria-hidden="true" className="size-[9px] shrink-0 rounded-full bg-mist" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-card bg-blush p-6">
            <h2 className="text-[21px] font-bold">No invitations yet.</h2>
            <p className="mt-3 text-sm font-medium">
              The account is created directly. There is no admin directory, invitation flow or role
              editor yet, so share the initial password safely and ask them to change it.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
