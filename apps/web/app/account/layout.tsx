import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AccountGate, AccountNav } from './account-nav';

export const metadata: Metadata = { title: 'Your account · aeron' };

export default function AccountLayout({ children }: LayoutProps<'/account'>) {
  return (
    <main className="mx-auto grid w-full max-w-[1440px] flex-1 items-start gap-8 px-5 py-10 md:px-10 lg:grid-cols-[263px_minmax(0,1fr)] xl:px-[64px]">
      <Suspense fallback={null}>
        <AccountNav />
      </Suspense>
      <div className="flex min-w-0 flex-col gap-8">
        <Suspense fallback={<p role="status">Loading your account…</p>}>
          <AccountGate>{children}</AccountGate>
        </Suspense>
      </div>
    </main>
  );
}
