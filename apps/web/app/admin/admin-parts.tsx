import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  BUTTON_DANGER,
  BUTTON_PRIMARY,
  BUTTON_QUIET,
  BUTTON_SECONDARY,
  CARD,
  OVERLINE,
  OVERLINE_ON_DARK,
  SIZE_MD,
} from '@/components/ui';

// The admin pages use the site's building blocks (components/ui.ts) at the in-card size.
export const ADMIN_CARD = `${CARD} flex flex-col gap-5`;
export const SMALL_BUTTON = `inline-flex cursor-pointer items-center justify-center gap-2 rounded-full ${SIZE_MD} font-bold`;
export const PINK_BUTTON = `${BUTTON_PRIMARY} ${SIZE_MD}`;
export const NAVY_BUTTON = `${BUTTON_SECONDARY} ${SIZE_MD}`;
export const DANGER_BUTTON = `${BUTTON_DANGER} ${SIZE_MD}`;
export const QUIET_BUTTON = `${BUTTON_QUIET} ${SIZE_MD}`;

/** A card's small overline and heading, as on the Figma admin frame. */
export function CardHeading({ kicker, title, id }: { kicker: string; title: string; id?: string }) {
  return (
    <div>
      <p className={OVERLINE}>{kicker}</p>
      <h2 id={id} className="mt-3 text-2xl leading-tight font-extrabold">
        {title}
      </h2>
    </div>
  );
}

/**
 * A data table with its name as a caption. On a narrow screen the table scrolls inside its own
 * focusable region, so the page itself never scrolls sideways.
 */
export function AdminTable({
  name,
  head,
  children,
}: {
  name: string;
  head: string[];
  children: ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={`${name} (scrolls sideways on small screens)`}
      tabIndex={0}
      className="relative max-w-full overflow-x-auto rounded-card border border-line bg-white focus-visible:outline-navy"
    >
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <caption className="sr-only">{name}</caption>
        <thead>
          <tr className="border-b border-line bg-ice">
            {head.map((label) => (
              <th
                key={label || 'actions'}
                scope="col"
                className="px-4 py-3 text-[11px] font-bold tracking-wide text-navy-soft uppercase"
              >
                {label || <span className="sr-only">Actions</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_td]:px-4 [&_td]:py-3 [&_tr]:border-b [&_tr]:border-line [&_tr:last-child]:border-0">
          {children}
        </tbody>
      </table>
    </div>
  );
}

/** Previous and next page links; either is left out where there is no such page. */
export function Pager({
  previous,
  next,
  label,
}: {
  previous?: string;
  next?: string;
  label: string;
}) {
  if (!previous && !next) return null;
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center gap-3">
      {previous && (
        <Link href={previous} className={QUIET_BUTTON}>
          Previous page
        </Link>
      )}
      <span className="text-sm font-medium text-navy-soft">{label}</span>
      {next && (
        <Link href={next} className={NAVY_BUTTON}>
          Next page
        </Link>
      )}
    </nav>
  );
}

/** A big number with what it counts. */
export function Stat({
  label,
  value,
  testId,
}: {
  label: string;
  value: ReactNode;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-card bg-navy p-5 text-white">
      <p className={OVERLINE_ON_DARK}>{label}</p>
      <p data-testid={testId} className="text-[44px] leading-none font-extrabold">
        {value}
      </p>
    </div>
  );
}
