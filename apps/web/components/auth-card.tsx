import type { ReactNode } from 'react';

export const SUBMIT_CLASS =
  'h-[52px] w-full cursor-pointer rounded-full bg-pink px-8 text-[15px] font-bold text-navy ' +
  'hover:brightness-105 focus-visible:outline-navy disabled:opacity-60';

/** The frame shared by the sign-in and register pages: heading on the page, form in a card. */
export function AuthCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-8 px-5 py-12">
      <div className="flex flex-col gap-4">
        <p className="text-xs leading-none font-bold text-navy-soft">{eyebrow}</p>
        <h1 className="text-[clamp(2.5rem,5vw,56px)] leading-none font-extrabold">{title}</h1>
      </div>
      <div className="rounded-[22px] bg-card p-5 sm:p-7">{children}</div>
    </main>
  );
}

/** An error that belongs to no single field, announced when it appears. */
export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-[12px] border border-danger p-3 text-sm font-semibold text-danger"
    >
      {message}
    </p>
  );
}
