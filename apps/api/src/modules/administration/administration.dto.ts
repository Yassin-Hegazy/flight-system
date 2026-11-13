import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEnum,
  IsInt,
  IsISO8601,
  IsObject,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { POSTGRES_INTEGER_MAX } from '../../shared/db';
import { FlightStatus } from '../flight-catalog/index';

/**
 * Declarative input rules: what a well-formed administrative request looks like, checked at the
 * HTTP boundary before any command runs. Whether the flight itself is acceptable (airports,
 * times, duplicates, transitions) is the Catalog's decision and is not repeated here.
 */

// An instant must say which zone it is in, so "2027-03-01T08:00" can never be read as server time.
const UTC_INSTANT =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const INSTANT_MESSAGE =
  '$property must be an ISO 8601 instant with a zone, e.g. 2027-03-01T06:00:00Z';

export const MAX_CABIN_CAPACITY = 600;

export class CabinCapacityBody {
  @ApiProperty({ type: 'integer', example: 180, minimum: 0, maximum: MAX_CABIN_CAPACITY })
  @IsInt()
  @Min(0)
  @Max(MAX_CABIN_CAPACITY)
  ECONOMY!: number;

  @ApiProperty({ type: 'integer', example: 20, minimum: 0, maximum: MAX_CABIN_CAPACITY })
  @IsInt()
  @Min(0)
  @Max(MAX_CABIN_CAPACITY)
  BUSINESS!: number;
}

/** Adult fares as positive whole numbers of minor units: 1500000 is 15,000.00 EGP. */
export class CabinFaresBody {
  @ApiProperty({ type: 'integer', example: 1_500_000, minimum: 1, maximum: POSTGRES_INTEGER_MAX })
  @IsInt()
  @Min(1)
  @Max(POSTGRES_INTEGER_MAX)
  ECONOMY!: number;

  @ApiProperty({ type: 'integer', example: 4_500_000, minimum: 1, maximum: POSTGRES_INTEGER_MAX })
  @IsInt()
  @Min(1)
  @Max(POSTGRES_INTEGER_MAX)
  BUSINESS!: number;
}

export class CreateFlightBody {
  @ApiProperty({ example: 'MS901' })
  @IsString()
  flightNumber!: string;

  @ApiProperty({ example: 'MS' })
  @IsString()
  airlineCode!: string;

  @ApiProperty({ example: 'CAI' })
  @IsString()
  originCode!: string;

  @ApiProperty({ example: 'LHR' })
  @IsString()
  destinationCode!: string;

  @ApiProperty({ format: 'date-time', example: '2027-06-01T06:00:00Z' })
  @IsISO8601({ strict: true })
  @Matches(UTC_INSTANT, { message: INSTANT_MESSAGE })
  scheduledDepartureUtc!: string;

  @ApiProperty({ format: 'date-time', example: '2027-06-01T11:00:00Z' })
  @IsISO8601({ strict: true })
  @Matches(UTC_INSTANT, { message: INSTANT_MESSAGE })
  scheduledArrivalUtc!: string;

  @ApiProperty({ example: 'EGP' })
  @Matches(/^[A-Z]{3}$/, { message: '$property must be an ISO 4217 code such as EGP' })
  currency!: string;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => CabinFaresBody)
  fares!: CabinFaresBody;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => CabinCapacityBody)
  capacity!: CabinCapacityBody;
}

export class UpdateFlightStatusBody {
  @ApiProperty({ enum: FlightStatus, example: FlightStatus.Delayed })
  @IsEnum(FlightStatus)
  status!: FlightStatus;

  /** Required when the status is DELAYED: the new departure time. */
  @ApiPropertyOptional({ format: 'date-time', example: '2027-06-01T07:30:00Z' })
  @ValidateIf((_body, value: unknown) => value !== undefined)
  @IsISO8601({ strict: true })
  @Matches(UTC_INSTANT, { message: INSTANT_MESSAGE })
  estimatedDepartureUtc?: string;
}
