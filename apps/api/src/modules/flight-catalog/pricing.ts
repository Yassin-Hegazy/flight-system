import { type Money, percentOf, multiply, sum } from '../../shared/money';
import { err, ok, type Result } from '../../shared/result';
import type { Cabin } from './value-objects';

export type PassengerType = 'ADULT' | 'CHILD' | 'INFANT';

export interface PassengerMix {
  adults: number;
  children?: number;
  infants?: number;
}

export interface PriceLine {
  passengerType: PassengerType;
  count: number;
  unitPrice: Money;
  amount: Money;
}

export interface PriceQuote {
  cabin: Cabin;
  total: Money;
  lines: PriceLine[];
}

export type PricingError = 'INVALID_PARTY' | 'TOO_MANY_INFANTS' | 'NO_FARE';

export interface PricedFlight {
  fares: Partial<Record<Cabin, Money>>;
}

/** How one passenger type's fare is derived from the cabin's adult fare. */
export interface FareRule {
  readonly passengerType: PassengerType;
  priceFrom(adultFare: Money): Money;
}

class PercentOfAdultFare implements FareRule {
  constructor(
    readonly passengerType: PassengerType,
    private readonly percent: number,
  ) {}

  priceFrom(adultFare: Money): Money {
    return percentOf(adultFare, this.percent);
  }
}

// Overview 4.3 (proposed): adults 100%, children 75%, infants 10% of the adult fare.
const FARE_RULES: Record<PassengerType, FareRule> = {
  ADULT: new PercentOfAdultFare('ADULT', 100),
  CHILD: new PercentOfAdultFare('CHILD', 75),
  INFANT: new PercentOfAdultFare('INFANT', 10),
};

/**
 * Simple Factory: the one place that maps a passenger type to its fare rule, so pricing never
 * branches on passenger type itself.
 */
export function fareRuleFor(passengerType: PassengerType): FareRule {
  return FARE_RULES[passengerType];
}

const isCount = (value: number) => Number.isSafeInteger(value) && value >= 0;

/**
 * The party total for one cabin, in integer minor units. Search shows it (US-FS-04) and Booking
 * charges it (US-BK-03), so both call this one pure function. The total is the sum of the lines,
 * so the parts always add up to it.
 */
export function priceParty(
  flight: PricedFlight,
  cabin: Cabin,
  party: PassengerMix,
): Result<PriceQuote, PricingError> {
  const counts: Record<PassengerType, number> = {
    ADULT: party.adults,
    CHILD: party.children ?? 0,
    INFANT: party.infants ?? 0,
  };
  if (!Object.values(counts).every(isCount) || counts.ADULT + counts.CHILD === 0) {
    return err('INVALID_PARTY');
  }
  // Infants sit on a lap, and each needs one adult (overview 4.3).
  if (counts.INFANT > counts.ADULT) return err('TOO_MANY_INFANTS');

  const adultFare = flight.fares[cabin];
  if (!adultFare) return err('NO_FARE');

  const lines: PriceLine[] = [];
  for (const passengerType of ['ADULT', 'CHILD', 'INFANT'] as const) {
    const count = counts[passengerType];
    if (count === 0) continue;
    const unitPrice = fareRuleFor(passengerType).priceFrom(adultFare);
    lines.push({ passengerType, count, unitPrice, amount: multiply(unitPrice, count) });
  }

  return ok({
    cabin,
    total: sum(
      lines.map((line) => line.amount),
      adultFare.currency,
    ),
    lines,
  });
}
