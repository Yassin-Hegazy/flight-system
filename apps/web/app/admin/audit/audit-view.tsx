'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';
import { Field, INPUT_CLASS } from '@/app/search/field';
import { FormAlert } from '@/components/auth-card';
import {
  actionLabel,
  AUDIT_PAGE_SIZE,
  type AuditEntry,
  changeLines,
  listAudit,
} from '@/lib/admin-api';
import { errorMessage, formText } from '@/lib/api';
import { formatInstant } from '@/lib/format';
import { AdminTable, NAVY_BUTTON, Pager, QUIET_BUTTON } from '../admin-parts';

/** Who changed what and when, newest first, 20 at a time (US-AD-07). The log is append-only. */
export function AuditView() {
  const params = useSearchParams();
  const pathname = usePathname();
  const flightId = params.get('flightId') ?? undefined;
  const page = Number(params.get('page') ?? '1') || 1;
  const audit = useQuery({
    queryKey: ['admin-audit', flightId, page],
    queryFn: () => listAudit(flightId, page),
  });
  const href = (next: number) => {
    const search = new URLSearchParams(params);
    search.set('page', String(next));
    return `${pathname}?${search.toString()}`;
  };
  const entries = audit.data;

  return (
    <>
      <p className="max-w-[65ch] text-[17px] font-medium text-navy-soft">
        Every administrative change is recorded here with its before and after values. Entries can
        never be edited or removed.
      </p>
      <AuditFilter flightId={flightId} />
      <FormAlert message={audit.isError ? errorMessage(audit.error) : null} />
      {audit.isPending && <p role="status">Loading the audit trail…</p>}
      {entries && (
        <>
          <AuditTable entries={entries} />
          <Pager
            label={`Page ${page}`}
            previous={page > 1 ? href(page - 1) : undefined}
            next={entries.length === AUDIT_PAGE_SIZE ? href(page + 1) : undefined}
          />
        </>
      )}
    </>
  );
}

/** Narrows the trail to one flight's changes; the flight ID lives in the URL. */
function AuditFilter({ flightId }: { flightId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const filter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = formText(new FormData(event.currentTarget), 'flightId').trim();
    router.push(id ? `${pathname}?flightId=${encodeURIComponent(id)}` : pathname);
  };
  return (
    <form key={flightId ?? ''} onSubmit={filter} className="flex flex-wrap items-end gap-3">
      <Field id="audit-flight" label="Flight ID" className="min-w-[260px] flex-1">
        {(control) => (
          <input
            {...control}
            name="flightId"
            defaultValue={flightId}
            autoComplete="off"
            className={INPUT_CLASS}
          />
        )}
      </Field>
      <button type="submit" className={NAVY_BUTTON}>
        Filter
      </button>
      {flightId && (
        <Link href={pathname} className={QUIET_BUTTON}>
          Show all changes
        </Link>
      )}
    </form>
  );
}

function AuditTable({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="rounded-card border border-line bg-white p-5 font-semibold">
        No changes recorded here yet.
      </p>
    );
  }
  return (
    <AdminTable name="Audit trail" head={['When', 'Change', 'Target', 'Values', 'By']}>
      {entries.map((entry) => (
        <tr key={entry.id} className="align-top">
          <td className="whitespace-nowrap">{formatInstant(entry.createdAt)}</td>
          <td className="font-bold">{actionLabel(entry.action)}</td>
          <td className="font-mono text-xs whitespace-nowrap" title={entry.target}>
            {entry.flightId ? (
              <Link href={`/admin/flights/${entry.flightId}`} className="underline">
                {shortTarget(entry.target)}
              </Link>
            ) : (
              shortTarget(entry.target)
            )}
          </td>
          <td>
            <ul className="flex flex-col gap-1 font-mono text-xs break-all">
              {changeLines(entry).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </td>
          <td className="font-mono text-xs" title={entry.actorId}>
            {entry.actorId.slice(0, 8)}
          </td>
        </tr>
      ))}
    </AdminTable>
  );
}

/** "fa6623c2-9aaf-…-630fbd80c5a3/ECONOMY" → "fa6623c2…/ECONOMY"; the full one is in the title. */
const shortTarget = (target: string) =>
  target.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, (id) => `${id.slice(0, 8)}…`);
