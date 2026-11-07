/**
 * Money as an integer count of the currency's smallest unit (piastres, cents) plus an ISO 4217 code.
 * Integer arithmetic is exact, so parts of a total always add up to the total (NFR-DATA-01).
 */
export interface Money {
  readonly amountMinor: number;
  readonly currency: string;
}

export class InvalidMoney extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMoney';
  }
}

const CURRENCY = /^[A-Z]{3}$/;

export function money(amountMinor: number, currency: string): Money {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new InvalidMoney(
      `Amount must be a non-negative whole number of minor units: ${amountMinor}`,
    );
  }
  if (!CURRENCY.test(currency)) {
    throw new InvalidMoney(`Currency must be an ISO 4217 code such as EGP: ${currency}`);
  }
  return { amountMinor, currency };
}

export function multiply(amount: Money, factor: number): Money {
  if (!Number.isSafeInteger(factor) || factor < 0) {
    throw new InvalidMoney(`Factor must be a non-negative whole number: ${factor}`);
  }
  return money(amount.amountMinor * factor, amount.currency);
}

/** A whole-number percentage of an amount, rounded half up to a whole minor unit. */
export function percentOf(amount: Money, percent: number): Money {
  if (!Number.isSafeInteger(percent) || percent < 0) {
    throw new InvalidMoney(`Percentage must be a non-negative whole number: ${percent}`);
  }
  return money(Math.round((amount.amountMinor * percent) / 100), amount.currency);
}

export function sum(amounts: readonly Money[], currency: string): Money {
  let total = 0;
  for (const amount of amounts) {
    if (amount.currency !== currency) {
      throw new InvalidMoney(`Cannot add ${amount.currency} to a ${currency} total`);
    }
    total += amount.amountMinor;
  }
  return money(total, currency);
}
