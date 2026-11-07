// The Flight Catalog's front door: the only file other modules may import.
// Other modules inject CATALOG_API and depend on the CatalogApi interface, never on the service.
export { FlightCatalogModule } from './flight-catalog.module';
export { CATALOG_API } from './catalog-api';
export type {
  AirportError,
  AirportInfo,
  AirportInput,
  AirportSuggestion,
  CatalogApi,
  ChangeStatusError,
  CreateFlightError,
  FareError,
  FlightInfo,
} from './catalog-api';
export type { NewFlight } from './flight';
export { FlightStatus } from './flight-status';
export type { PassengerMix, PassengerType, PriceLine, PriceQuote, PricingError } from './pricing';
export { AirportCode, CABINS, FlightNumber, Route } from './value-objects';
export type { Cabin } from './value-objects';
