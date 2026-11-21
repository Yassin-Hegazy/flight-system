// The aeron building blocks as class lists (docs/BRAND.md). Pages compose these rather than
// writing their own card, button or label styles, so the whole site stays one system.

/** The one card: white on the teal page, a hairline border, 22px corners. */
export const CARD = 'rounded-card border border-line bg-white p-5 sm:p-7';
/** The emphasis card: navy, for one feature per screen (a sidebar, a summary, a document). */
export const CARD_DARK = 'rounded-card bg-navy p-5 text-white sm:p-7';
/** A surface inside a card: a flight leg, a group of fields. */
export const INSET = 'rounded-inset bg-ice';

/** Small uppercase label above a heading. The only small caps text on the site. */
export const OVERLINE =
  'text-[11px] leading-none font-bold tracking-[0.08em] text-navy-soft uppercase';
export const OVERLINE_ON_DARK =
  'text-[11px] leading-none font-bold tracking-[0.08em] text-mist uppercase';

const BUTTON_BASE =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-full font-bold ' +
  'transition-[background-color,border-color,filter] disabled:cursor-not-allowed disabled:opacity-60';

/** Sizes: 44px for actions inside cards and tables, 52px for a page's main action. */
export const SIZE_MD = 'h-11 px-5 text-[13px]';
export const SIZE_LG = 'h-[52px] px-7 text-[15px]';

/** Pink: the main action of a view, and only that. One per screen where possible. */
export const BUTTON_PRIMARY = `${BUTTON_BASE} bg-pink text-navy hover:brightness-105 focus-visible:outline-navy`;
/** Navy: every other action that matters. */
export const BUTTON_SECONDARY = `${BUTTON_BASE} bg-navy text-white hover:bg-navy-soft`;
/** White with a hairline: back, cancel, clear, secondary links. */
export const BUTTON_QUIET = `${BUTTON_BASE} border border-line bg-white text-navy hover:border-navy`;
/** Red: an action that cannot be undone. */
export const BUTTON_DANGER = `${BUTTON_BASE} bg-danger text-white hover:brightness-110`;

/** A selected item on a navy surface (navigation, toggles): white, not pink. */
export const SELECTED_ON_DARK = 'bg-white text-navy';
