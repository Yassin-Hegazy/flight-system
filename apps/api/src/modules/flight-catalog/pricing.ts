import type { Cabin } from './value-objects';

export interface Fare {
  amount: number;
  currency: string;
}

export interface PassengerMix {
  adults: number;
  children?: number;
  infants?: number;
}

export interface PriceQuote {
  currency: string;
  total: number;
  breakdown: { cabin: Cabin; quantity: number; unitAmount: number; amount: number }[];
}

export interface PricedFlight {
  fares: Partial<Record<Cabin, Fare>>;
}

/**
 * The party total for one cabin. Search shows it and Booking charges it, so both call this one
 * pure function (Catalog pack, section 2).
 */
export function priceParty(flight: PricedFlight, cabin: Cabin, party: PassengerMix): PriceQuote {
  const quantity = party.adults + (party.children ?? 0);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('At least one adult or child is required');
  }
  const fare = flight.fares[cabin];
  if (!fare) throw new Error(`No fare is configured for ${cabin}`);
  return {
    currency: fare.currency,
    total: fare.amount * quantity,
    breakdown: [{ cabin, quantity, unitAmount: fare.amount, amount: fare.amount * quantity }],
  };
}
