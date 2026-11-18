import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDefined,
  IsEnum,
  IsISO8601,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { POSTGRES_INTEGER_MAX } from '../../shared/db';
import { FlightStatus } from '../flight-catalog/index';
import {
  FlightTemplateBody,
  INSTANT_MESSAGE,
  MAX_CABIN_CAPACITY,
  UTC_INSTANT,
} from './administration.dto';

export class CapacityBody {
  @ApiProperty({ example: 180 })
  @IsInt()
  @Min(0)
  @Max(MAX_CABIN_CAPACITY)
  capacity!: number;
}

export class FareBody {
  @ApiProperty({ example: 1500000 })
  @IsInt()
  @Min(1)
  @Max(POSTGRES_INTEGER_MAX)
  amountMinor!: number;

  @ApiProperty({ example: 'EGP' })
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
}

export class AirportBody {
  @ApiProperty({ example: 'Cairo International Airport' })
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiProperty({ example: 'Cairo' })
  @IsString()
  @Length(1, 120)
  city!: string;

  @ApiProperty({ example: 'Egypt' })
  @IsString()
  @Length(1, 120)
  country!: string;

  @ApiProperty({ example: 'Africa/Cairo' })
  @IsString()
  @Length(1, 64)
  timezone!: string;
}

export class AuditQuery {
  @ApiPropertyOptional({ format: 'uuid', description: 'Only changes to this flight.' })
  @ValidateIf((_query, value: unknown) => value !== undefined)
  @IsUUID()
  flightId?: string;

  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  page = 1;
}

/** One page of a list: 20 rows, counted from page 1. */
export const ADMIN_PAGE_SIZE = 20;

export class AdminFlightsQuery {
  @ApiPropertyOptional({ example: 'CAI', description: 'Departing from this IATA airport.' })
  @IsOptional()
  @Matches(/^[A-Za-z]{3}$/, { message: '$property must be a three-letter IATA code' })
  origin?: string;

  @ApiPropertyOptional({ example: 'LHR', description: 'Arriving at this IATA airport.' })
  @IsOptional()
  @Matches(/^[A-Za-z]{3}$/, { message: '$property must be a three-letter IATA code' })
  destination?: string;

  @ApiPropertyOptional({ example: 'MS777' })
  @IsOptional()
  @Matches(/^[A-Za-z0-9]{2}\d{1,4}$/, { message: '$property must look like MS777' })
  flightNumber?: string;

  @ApiPropertyOptional({ enum: FlightStatus })
  @IsOptional()
  @IsEnum(FlightStatus)
  status?: FlightStatus;

  @ApiPropertyOptional({ example: '2027-03-01T00:00:00Z', description: 'Departing at or after.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(UTC_INSTANT, { message: INSTANT_MESSAGE })
  departingFrom?: string;

  @ApiPropertyOptional({ example: '2027-03-02T00:00:00Z', description: 'Departing before.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(UTC_INSTANT, { message: INSTANT_MESSAGE })
  departingBefore?: string;

  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  page = 1;
}

export class AdminAirportsQuery {
  @ApiPropertyOptional({ example: 'cairo', description: 'Code prefix, or text in city or name.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;

  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  page = 1;
}

export class RecurringFlightBody {
  @ApiProperty({ type: FlightTemplateBody })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => FlightTemplateBody)
  template!: FlightTemplateBody;

  @ApiProperty({ example: '2027-04-19' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @ApiProperty({ example: '2027-05-03' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;

  @ApiProperty({ example: [1], description: 'ISO weekdays, Monday = 1 through Sunday = 7' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays!: number[];

  @ApiProperty({ example: '09:00', description: 'Local time at the departure airport' })
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
  localDeparture!: string;

  @ApiProperty({ example: 300 })
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes!: number;
}
