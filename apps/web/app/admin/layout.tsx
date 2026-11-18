import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminGate, AdminNav } from './admin-nav';

export const metadata: Metadata = { title: 'Administration · aeron' };

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <main className="mx-auto grid w-full max-w-[1440px] flex-1 items-start gap-8 px-5 py-10 md:px-10 lg:grid-cols-[263px_minmax(0,1fr)] xl:px-[64px]">
      <Suspense fallback={null}>
        <AdminNav />
      </Suspense>
      <div className="flex min-w-0 flex-col gap-8">
        <Suspense fallback={<p role="status">Checking your access…</p>}>
          <AdminGate>{children}</AdminGate>
        </Suspense>
      </div>
    </main>
  );
}
