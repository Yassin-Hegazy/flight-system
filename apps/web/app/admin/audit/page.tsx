import { Suspense } from 'react';
import { PageHeading } from '@/components/page-parts';
import { AuditView } from './audit-view';

export default function AdminAuditPage() {
  return (
    <>
      <PageHeading eyebrow="Administration · Accountability" title="Audit trail" />
      <Suspense fallback={<p role="status">Loading the audit trail…</p>}>
        <AuditView />
      </Suspense>
    </>
  );
}
