export interface Money {
  readonly amountMinor: number;
  readonly currency: string;
}

export class InvalidMoney extends Error {}

export function money(amountMinor: number, currency: string): Money {
  void amountMinor;
  void currency;
  throw new Error('Not implemented');
}

export function multiply(amount: Money, factor: number): Money {
  void amount;
  void factor;
  throw new Error('Not implemented');
}

export function percentOf(amount: Money, percent: number): Money {
  void amount;
  void percent;
  throw new Error('Not implemented');
}

export function sum(amounts: readonly Money[], currency: string): Money {
  void amounts;
  void currency;
  throw new Error('Not implemented');
}
