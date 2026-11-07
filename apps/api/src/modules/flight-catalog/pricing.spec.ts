import { describe, expect, it } from 'vitest';
import { money } from '../../shared/money';
import { fareRuleFor, priceParty, type PricedFlight } from './pricing';

// Overview 4.3: child fare 75% of the adult fare, infant 10%; each infant needs one adult.
// Search shows this total (US-FS-04) and Booking charges it (US-BK-03).
const flight: PricedFlight = {
  fares: { ECONOMY: money(10000, 'EGP'), BUSINESS: money(40000, 'EGP') },
};

describe('US-FS-04 / US-BK-03 party pricing', () => {
  it('US-FS-04-T01 prices adults at 100%, children at 75% and infants at 10% of the adult fare', () => {
    const result = priceParty(flight, 'ECONOMY', { adults: 2, children: 1, infants: 1 });

    expect(result).toEqual({
      ok: true,
      value: {
        cabin: 'ECONOMY',
        total: money(28500, 'EGP'),
        lines: [
          {
            passengerType: 'ADULT',
            count: 2,
            unitPrice: money(10000, 'EGP'),
            amount: money(20000, 'EGP'),
          },
          {
            passengerType: 'CHILD',
            count: 1,
            unitPrice: money(7500, 'EGP'),
            amount: money(7500, 'EGP'),
          },
          {
            passengerType: 'INFANT',
            count: 1,
            unitPrice: money(1000, 'EGP'),
            amount: money(1000, 'EGP'),
          },
        ],
      },
    });
  });

  it('US-FS-04-T02 rejects more infants than adults', () => {
    expect(priceParty(flight, 'ECONOMY', { adults: 1, infants: 2 })).toEqual({
      ok: false,
      error: 'TOO_MANY_INFANTS',
    });
  });

  it('US-FS-04-T03 rejects a party with no seated passenger, or counts that are not whole numbers', () => {
    expect(priceParty(flight, 'ECONOMY', { adults: 0 })).toEqual({
      ok: false,
      error: 'INVALID_PARTY',
    });
    expect(priceParty(flight, 'ECONOMY', { adults: 1.5 })).toEqual({
      ok: false,
      error: 'INVALID_PARTY',
    });
    expect(priceParty(flight, 'ECONOMY', { adults: 1, children: -1 })).toEqual({
      ok: false,
      error: 'INVALID_PARTY',
    });
  });

  it('US-FS-04-T04 rejects a cabin with no fare instead of inventing a price', () => {
    expect(
      priceParty({ fares: { BUSINESS: money(40000, 'EGP') } }, 'ECONOMY', { adults: 1 }),
    ).toEqual({
      ok: false,
      error: 'NO_FARE',
    });
  });

  it('US-FS-04-T05 the lines always sum to the total (property over many fares and parties)', () => {
    for (let fare = 1; fare <= 20000; fare += 997) {
      for (const party of [
        { adults: 1 },
        { adults: 2, children: 3 },
        { adults: 3, children: 1, infants: 3 },
      ]) {
        const result = priceParty({ fares: { ECONOMY: money(fare, 'EGP') } }, 'ECONOMY', party);
        if (!result.ok) throw new Error(result.error);
        const sumOfLines = result.value.lines.reduce(
          (sum, line) => sum + line.amount.amountMinor,
          0,
        );
        expect(result.value.total.amountMinor).toBe(sumOfLines);
      }
    }
  });

  it('US-FS-04-T06 one factory maps each passenger type to its fare rule', () => {
    expect(fareRuleFor('ADULT').priceFrom(money(3333, 'EGP'))).toEqual(money(3333, 'EGP'));
    expect(fareRuleFor('CHILD').priceFrom(money(3333, 'EGP'))).toEqual(money(2500, 'EGP'));
    expect(fareRuleFor('INFANT').priceFrom(money(3333, 'EGP'))).toEqual(money(333, 'EGP'));
  });
});
