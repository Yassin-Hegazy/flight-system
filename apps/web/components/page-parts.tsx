import type { ReactNode } from 'react';
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD, OVERLINE, SIZE_LG } from './ui';

export const PAGE = 'mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-8 px-5 py-10 md:px-10';
/** A page's main action, and its other actions, as links (see components/ui.ts). */
export const PINK_LINK = `${BUTTON_PRIMARY} ${SIZE_LG}`;
export const NAVY_LINK = `${BUTTON_SECONDARY} ${SIZE_LG}`;

export function PageHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex flex-col gap-4">
      <p className={OVERLINE}>{eyebrow}</p>
      <h1 className="text-[clamp(2.25rem,5vw,64px)] leading-none font-extrabold">{title}</h1>
    </div>
  );
}

/** A named card: the name is the region's accessible name and its visible heading. */
export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className={`${CARD} flex flex-col gap-4`}>
      <h2 className={OVERLINE}>{title}</h2>
      {children}
    </section>
  );
}

/** A status spelled out in a pill; the colour is decoration, the word is the information. */
export function StatusPill({ label, testId }: { label: string; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className="inline-flex items-center rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white"
    >
      {label}
    </span>
  );
}
