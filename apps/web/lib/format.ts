// Display-only formatting. The API sends money as integer minor units and times as local strings
// with their offset; this file turns them into text, and never computes a price.
import type { Money, PriceLine } from './search-api';

function fractionDigits(currency: string): number {
  return (
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

/** {amountMinor: 1550000, currency: 'EGP'} → "EGP 15,500.00". */
export function formatMoney({ amountMinor, currency }: Money): string {
  // Display only: Intl rounds to the currency's digits, so the shown amount is exact.
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
  }).format(amountMinor / 10 ** fractionDigits(currency));
}

/**
 * What the traveler typed ("8000" or "8000.50") as integer minor units, by string arithmetic so no
 * floating-point rounding is involved. Returns undefined for anything that is not an amount.
 */
export function toMinorUnits(text: string, currency = 'EGP'): number | undefined {
  const match = /^(\d{1,9})(?:\.(\d{1,3}))?$/.exec(text.trim().replaceAll(',', ''));
  if (!match) return undefined;
  const digits = fractionDigits(currency);
  const fraction = (match[2] ?? '').padEnd(digits, '0');
  if (fraction.length > digits) return undefined;
  return Number(`${match[1]}${fraction}`);
}

/** Minor units back to the text a traveler would type: 800000 → "8000". */
export function fromMinorUnits(minor: string | null, currency = 'EGP'): string {
  if (!minor || !/^\d+$/.test(minor)) return '';
  const digits = fractionDigits(currency);
  const padded = minor.padStart(digits + 1, '0');
  const whole = padded.slice(0, padded.length - digits);
  const fraction = padded.slice(padded.length - digits).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

/** "2026-12-10T09:30+02:00" → "09:30". */
export const timeOf = (local: string) => local.slice(11, 16);

/** "2026-12-10T09:30+02:00" → "Thu 10 Dec". */
export function dayOf(local: string): string {
  const date = new Date(`${local.slice(0, 10)}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

/** 330 → "5 h 30 min". */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

const PASSENGER_LABEL: Record<PriceLine['passengerType'], [string, string]> = {
  ADULT: ['adult', 'adults'],
  CHILD: ['child', 'children'],
  INFANT: ['infant', 'infants'],
};

/** "2 adults × EGP 10,000.00". */
export function describeLine(line: PriceLine): string {
  const [one, many] = PASSENGER_LABEL[line.passengerType];
  return `${line.count} ${line.count === 1 ? one : many} × ${formatMoney(line.unitPrice)}`;
}
