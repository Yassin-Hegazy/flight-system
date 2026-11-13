import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '../../shared/result';
import { isLocalDate } from '../../shared/time';
import type { OneWayCriteria, RoundTripCriteria, RoundTripPage, SearchError } from './search-api';
import { SearchOneWay } from './search-one-way';

/**
 * The round-trip use case (US-FS-06 AC-1, AC-2): two independent one-way searches, outbound and
 * the reverse route on the return date. Each leg has its own sort and page, so travelers choose
 * each leg on its own merits; filters and page size apply to both. Pairing the legs into
 * itineraries and booking them together is Booking's job (AC-3).
 */
@Injectable()
export class SearchRoundTrip {
  constructor(private readonly oneWay: SearchOneWay) {}

  async execute(criteria: RoundTripCriteria): Promise<Result<RoundTripPage, SearchError>> {
    if (!isLocalDate(criteria.date) || !isLocalDate(criteria.returnDate)) {
      return err('INVALID_DATE');
    }
    // YYYY-MM-DD strings compare in calendar order; the same day is a valid trip.
    if (criteria.returnDate < criteria.date) return err('RETURN_BEFORE_OUTBOUND');

    const [outbound, inbound] = await Promise.all([
      this.oneWay.execute(outboundLeg(criteria)),
      this.oneWay.execute(inboundLeg(criteria)),
    ]);
    if (!outbound.ok) return outbound;
    if (!inbound.ok) return inbound;
    return ok({ outbound: outbound.value, inbound: inbound.value });
  }
}

function sharedCriteria(criteria: RoundTripCriteria) {
  const { passengers, cabin, filters, pageSize } = criteria;
  return { passengers, cabin, filters, pageSize };
}

function outboundLeg(criteria: RoundTripCriteria): OneWayCriteria {
  return {
    ...sharedCriteria(criteria),
    origin: criteria.origin,
    destination: criteria.destination,
    date: criteria.date,
    sort: criteria.outboundSort,
    page: criteria.outboundPage,
  };
}

function inboundLeg(criteria: RoundTripCriteria): OneWayCriteria {
  return {
    ...sharedCriteria(criteria),
    origin: criteria.destination,
    destination: criteria.origin,
    date: criteria.returnDate,
    sort: criteria.inboundSort,
    page: criteria.inboundPage,
  };
}
