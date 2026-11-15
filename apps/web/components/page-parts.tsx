import type { ReactNode } from 'react';

export const PAGE = 'mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-8 px-5 py-10 md:px-10';
export const NAVY_LINK =
  'inline-flex h-[52px] items-center gap-2 rounded-full bg-navy px-6 text-[15px] font-bold text-white hover:bg-navy-soft';
export const PINK_LINK =
  'inline-flex h-[52px] items-center gap-2 rounded-full bg-pink px-8 text-[15px] font-bold text-navy hover:brightness-105 focus-visible:outline-navy';

export function PageHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-none font-bold text-navy-soft uppercase">{eyebrow}</p>
      <h1 className="text-[clamp(2.25rem,5vw,64px)] leading-none font-extrabold">{title}</h1>
    </div>
  );
}

/** A named card: the name is the region's accessible name and its visible heading. */
export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-4 rounded-[22px] bg-card p-5 sm:p-7">
      <h2 className="text-xs leading-none font-bold text-navy-soft uppercase">{title}</h2>
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
