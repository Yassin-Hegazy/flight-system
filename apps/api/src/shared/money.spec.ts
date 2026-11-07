import { describe, expect, it } from 'vitest';
import { InvalidMoney, money, multiply, percentOf, sum } from './money';

describe('NFR-DATA-01 money in integer minor units', () => {
  it('NFR-DATA-01-T01 stores amounts as integer minor units with an ISO 4217 code', () => {
    expect(money(45075, 'EGP')).toEqual({ amountMinor: 45075, currency: 'EGP' });
  });

  it('NFR-DATA-01-T02 rejects fractional amounts, negative amounts and malformed currencies', () => {
    expect(() => money(450.75, 'EGP')).toThrow(InvalidMoney);
    expect(() => money(-1, 'EGP')).toThrow(InvalidMoney);
    expect(() => money(100, 'egp')).toThrow(InvalidMoney);
    expect(() => money(100, 'EGYP')).toThrow(InvalidMoney);
  });

  it('NFR-DATA-01-T03 takes a percentage with round-half-up to a whole minor unit', () => {
    expect(percentOf(money(3333, 'EGP'), 75)).toEqual(money(2500, 'EGP'));
    expect(percentOf(money(3333, 'EGP'), 10)).toEqual(money(333, 'EGP'));
    expect(percentOf(money(10000, 'EGP'), 100)).toEqual(money(10000, 'EGP'));
  });

  it('NFR-DATA-01-T04 multiplies and sums exactly, without floating-point drift', () => {
    const tenPiastres = money(10, 'EGP');
    const twentyPiastres = money(20, 'EGP');
    expect(sum([tenPiastres, twentyPiastres], 'EGP')).toEqual(money(30, 'EGP'));
    expect(multiply(money(3333, 'EGP'), 3)).toEqual(money(9999, 'EGP'));
  });

  it('NFR-DATA-01-T05 refuses to add amounts in different currencies', () => {
    expect(() => sum([money(100, 'EGP'), money(100, 'USD')], 'EGP')).toThrow(InvalidMoney);
  });

  it('NFR-DATA-01-T06 parts always sum to the total (property over many amounts)', () => {
    for (let fare = 1; fare <= 5000; fare += 37) {
      const adult = money(fare, 'EGP');
      const parts = [multiply(adult, 2), percentOf(adult, 75), percentOf(adult, 10)];
      const total = sum(parts, 'EGP');
      expect(total.amountMinor).toBe(parts.reduce((acc, part) => acc + part.amountMinor, 0));
      expect(Number.isInteger(total.amountMinor)).toBe(true);
    }
  });
});
