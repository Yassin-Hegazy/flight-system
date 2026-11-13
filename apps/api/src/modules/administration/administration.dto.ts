import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { FlightStatus } from '../flight-catalog/index';

/**
 * Declarative input rules: what a well-formed administrative request looks like, checked at the
 * HTTP boundary before any command runs. Whether the flight itself is acceptable (airports,
 * times, duplicates, transitions) is the Catalog's decision and is not repeated here.
 */

// An instant must say which zone it is in, so "2027-03-01T08:00" can never be read as server time.
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const INSTANT_MESSAGE =
  '$property must be an ISO 8601 instant with a zone, e.g. 2027-03-01T06:00:00Z';

export const MAX_CABIN_CAPACITY = 600;

export class CabinCapacityBody {
  @IsInt()
  @Min(0)
  @Max(MAX_CABIN_CAPACITY)
  ECONOMY!: number;

  @IsInt()
  @Min(0)
  @Max(MAX_CABIN_CAPACITY)
  BUSINESS!: number;
}

/** Adult fares as positive whole numbers of minor units: 1500000 is 15,000.00 EGP. */
export class CabinFaresBody {
  @IsInt()
  @Min(1)
  ECONOMY!: number;

  @IsInt()
  @Min(1)
  BUSINESS!: number;
}

export class CreateFlightBody {
  @IsString()
  flightNumber!: string;

  @IsString()
  airlineCode!: string;

  @IsString()
  originCode!: string;

  @IsString()
  destinationCode!: string;

  @Matches(UTC_INSTANT, { message: INSTANT_MESSAGE })
  scheduledDepartureUtc!: string;

  @Matches(UTC_INSTANT, { message: INSTANT_MESSAGE })
  scheduledArrivalUtc!: string;

  @Matches(/^[A-Z]{3}$/, { message: '$property must be an ISO 4217 code such as EGP' })
  currency!: string;

  @ValidateNested()
  @Type(() => CabinFaresBody)
  fares!: CabinFaresBody;

  @ValidateNested()
  @Type(() => CabinCapacityBody)
  capacity!: CabinCapacityBody;
}

export class UpdateFlightStatusBody {
  @IsEnum(FlightStatus)
  status!: FlightStatus;

  /** Required when the status is DELAYED: the new departure time. */
  @IsOptional()
  @Matches(UTC_INSTANT, { message: INSTANT_MESSAGE })
  estimatedDepartureUtc?: string;
}
