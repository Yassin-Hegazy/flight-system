import { Injectable } from '@nestjs/common';
import type { Result } from '../../shared/result';
import type { RoundTripCriteria, RoundTripPage, SearchError } from './search-api';
import { SearchOneWay } from './search-one-way';

/** The round-trip use case: two independent one-way searches (US-FS-06). */
@Injectable()
export class SearchRoundTrip {
  constructor(private readonly oneWay: SearchOneWay) {}

  execute(criteria: RoundTripCriteria): Promise<Result<RoundTripPage, SearchError>> {
    void this.oneWay;
    return Promise.reject(new Error(`Not implemented: SearchRoundTrip(${criteria.returnDate})`));
  }
}
