import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from '../../shared/result';
import { CLOCK, type Clock } from '../../shared/time';
import { CATALOG_API, type CatalogApi, type FlightInfo } from '../flight-catalog/index';
import { INVENTORY_API, type InventoryApi } from '../inventory/index';
import { type CheckedCriteria, checkAirportsAndDate, checkCriteria } from './criteria-validator';
import { paginate } from './paginate';
import { toSearchResult } from './result-mapper';
import type { OneWayCriteria, ResultPage, SearchError, SearchResult } from './search-api';
import { SortRegistry } from './sorting/sort-registry';

/**
 * The one-way search use case: the imperative part of the module. Every search runs the same
 * steps in this order (pack section 3.1), each step a small function of its own:
 *
 *   1. validate             checkCriteria, then one airport read for checkAirportsAndDate
 *   2. candidates           catalog.findFlights: one route, one local day
 *   3. bookable             catalog.isBookable: pure, no I/O
 *   4. seats                ONE batched inventory.checkAvailability for every bookable flight
 *   5. price                catalog.priceParty: pure; a flight that cannot be priced is dropped
 *   6-8. filter, sort, page present()
 *
 * Cheap, narrowing steps come first, so the expensive ones run on fewer flights. Whatever the
 * number of flights, a search makes three reads: airports, flights and availability.
 */
@Injectable()
export class SearchOneWay {
  constructor(
    @Inject(CATALOG_API) private readonly catalog: CatalogApi,
    @Inject(INVENTORY_API) private readonly inventory: InventoryApi,
    private readonly sorts: SortRegistry,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(criteria: OneWayCriteria): Promise<Result<ResultPage, SearchError>> {
    const checked = checkCriteria(criteria, this.sorts);
    if (!checked.ok) return checked;
    const now = this.clock.now();
    const airports = await this.catalog.getAirports([
      criteria.origin.value,
      criteria.destination.value,
    ]);
    const invalid = checkAirportsAndDate(criteria, airports, now);
    if (invalid) return err(invalid);

    const candidates = await this.catalog.findFlights(checked.value.route, criteria.date);
    const bookable = candidates.filter((flight) => this.catalog.isBookable(flight, now));
    const withSeats = await this.withSeats(bookable, criteria);
    return ok(present(this.price(withSeats, criteria), checked.value));
  }

  /** Step 4: one Inventory call for all flights. Infants take no seat; Inventory knows that. */
  private async withSeats(flights: FlightInfo[], criteria: OneWayCriteria): Promise<FlightInfo[]> {
    const availability = await this.inventory.checkAvailability(
      flights.map((flight) => ({
        flightId: flight.id,
        cabin: criteria.cabin,
        passengers: criteria.passengers,
      })),
    );
    // The criteria were validated in step 1, so a refusal here is a fault, not "no seats".
    if (!availability.ok) {
      throw new Error(`Inventory refused a validated search: ${availability.error}`);
    }
    // One answer per request, in input order.
    return flights.filter((_, index) => {
      const answer = availability.value[index];
      return answer.inventoryFound && answer.canAccommodate;
    });
  }

  /** Step 5: the Catalog's party price, the same one Booking charges. */
  private price(flights: FlightInfo[], criteria: OneWayCriteria): SearchResult[] {
    return flights.flatMap((flight) => {
      const quote = this.catalog.priceParty(flight, criteria.cabin, criteria.passengers);
      return quote.ok ? [toSearchResult(flight, quote.value)] : [];
    });
  }
}

/** Steps 6 to 8. Sorting and filtering happen before paging, so `total` counts every page. */
function present(results: SearchResult[], checked: CheckedCriteria): ResultPage {
  const sorted = [...results].sort((a, b) => checked.sort.compare(a, b));
  return { ...paginate(sorted, checked), sort: checked.sort.key, filters: {} };
}
