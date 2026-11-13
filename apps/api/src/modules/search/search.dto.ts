import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';
import { POSTGRES_INTEGER_MAX } from '../../shared/db';
import { isLocalDate } from '../../shared/time';
import { AirportCode, type Cabin, CABINS } from '../flight-catalog/index';
import type { Filters, OneWayCriteria, RoundTripCriteria } from './search-api';

/**
 * The search schema (NFR-SEC-03): every field arrives from a query string the user can edit, so
 * each one is typed, bounded and checked here before any use case runs. Whether the request makes
 * sense (same airport, past date, party rules, supported sort) is the use case's decision.
 */

const IATA = /^[A-Za-z]{3}$/;
const IATA_MESSAGE = '$property must be a 3-letter IATA airport code';
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const AIRLINE = /^[A-Za-z0-9]{2}$/;
/** More seats than any party may take; the 1-9 rule itself is the use case's. */
const MAX_PASSENGER_FIELD = 9;
const MAX_AIRLINES = 20;
/** Large enough that "100,000 per page" is capped to 50 rather than rejected (US-FS-05 AC-1). */
const MAX_PAGING_FIELD = 1_000_000;

/** A real calendar date written as YYYY-MM-DD: no time, no zone, no 30 February. */
function IsLocalDate(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isLocalDate',
      target: target.constructor,
      propertyName: propertyName as string,
      options: { message: '$property must be a date written as YYYY-MM-DD', ...options },
      validator: { validate: (value: unknown) => typeof value === 'string' && isLocalDate(value) },
    });
  };
}

/** "MS,BA" or airlines=MS&airlines=BA: either way, one list of codes. */
const toList = ({ value }: { value: unknown }): unknown => {
  const parts: unknown[] = Array.isArray(value) ? value : [value];
  if (!parts.every((part): part is string => typeof part === 'string')) return value;
  return parts
    .flatMap((part) => part.split(','))
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
};

/** The fields a one-way and a round-trip search share. */
class SearchQueryBase {
  @ApiProperty({ example: 'CAI', description: 'Origin airport (IATA)' })
  @IsString()
  @Matches(IATA, { message: IATA_MESSAGE })
  origin!: string;

  @ApiProperty({ example: 'LHR', description: 'Destination airport (IATA)' })
  @IsString()
  @Matches(IATA, { message: IATA_MESSAGE })
  destination!: string;

  @ApiProperty({ example: '2026-12-10', description: 'Departure date at the origin airport' })
  @IsLocalDate()
  date!: string;

  @ApiPropertyOptional({ type: 'integer', example: 1, default: 1, minimum: 0, maximum: 9 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_PASSENGER_FIELD)
  adults?: number;

  @ApiPropertyOptional({ type: 'integer', example: 0, default: 0, minimum: 0, maximum: 9 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_PASSENGER_FIELD)
  children?: number;

  @ApiPropertyOptional({ type: 'integer', example: 0, default: 0, minimum: 0, maximum: 9 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_PASSENGER_FIELD)
  infants?: number;

  @ApiPropertyOptional({ enum: CABINS, default: 'ECONOMY' })
  @IsOptional()
  @IsIn(CABINS)
  cabin?: Cabin;

  @ApiPropertyOptional({
    type: 'integer',
    example: 800000,
    description: 'Highest party total, in minor units (800000 is 8,000.00)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(POSTGRES_INTEGER_MAX)
  maxTotal?: number;

  @ApiPropertyOptional({ example: '06:00', description: 'Earliest local departure, inclusive' })
  @IsOptional()
  @IsString()
  @Matches(HH_MM, { message: '$property must be a time written as HH:mm' })
  departFrom?: string;

  @ApiPropertyOptional({ example: '12:00', description: 'Latest local departure, inclusive' })
  @IsOptional()
  @IsString()
  @Matches(HH_MM, { message: '$property must be a time written as HH:mm' })
  departTo?: string;

  @ApiPropertyOptional({
    type: String,
    example: 'MS,BA',
    description: 'Airline codes, comma-separated; any one of them matches',
  })
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(MAX_AIRLINES)
  @Matches(AIRLINE, { each: true, message: 'each value in $property must be a 2-character code' })
  airlines?: string[];

  @ApiPropertyOptional({ type: 'integer', default: 20, description: 'Above 50 is capped to 50' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Max(MAX_PAGING_FIELD)
  pageSize?: number;
}

const SORT_DOC = {
  example: 'PRICE',
  description: 'PRICE, DURATION, DEPARTURE_TIME or ARRIVAL_TIME',
};

export class OneWaySearchQuery extends SearchQueryBase {
  @ApiPropertyOptional({ ...SORT_DOC, default: 'PRICE' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  sort?: string;

  @ApiPropertyOptional({ type: 'integer', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Max(MAX_PAGING_FIELD)
  page?: number;
}

export class RoundTripSearchQuery extends SearchQueryBase {
  @ApiProperty({ example: '2026-12-17', description: 'Return date at the destination airport' })
  @IsLocalDate()
  returnDate!: string;

  @ApiPropertyOptional(SORT_DOC)
  @IsOptional()
  @IsString()
  @Length(1, 32)
  outboundSort?: string;

  @ApiPropertyOptional(SORT_DOC)
  @IsOptional()
  @IsString()
  @Length(1, 32)
  inboundSort?: string;

  @ApiPropertyOptional({ type: 'integer', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Max(MAX_PAGING_FIELD)
  outboundPage?: number;

  @ApiPropertyOptional({ type: 'integer', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Max(MAX_PAGING_FIELD)
  inboundPage?: number;
}

/** The filters present in the query; an absent window bound means the start or end of the day. */
export function filtersOf(query: SearchQueryBase): Filters {
  const filters: Filters = {};
  if (query.maxTotal !== undefined) filters.maxTotal = query.maxTotal;
  if (query.departFrom || query.departTo) {
    filters.departureWindow = { from: query.departFrom ?? '00:00', to: query.departTo ?? '23:59' };
  }
  if (query.airlines?.length) filters.airlines = query.airlines.map((code) => code.toUpperCase());
  return filters;
}

function sharedCriteria(query: SearchQueryBase) {
  return {
    origin: AirportCode.of(query.origin),
    destination: AirportCode.of(query.destination),
    date: query.date,
    passengers: {
      adults: query.adults ?? 1,
      children: query.children ?? 0,
      infants: query.infants ?? 0,
    },
    cabin: query.cabin ?? 'ECONOMY',
    filters: filtersOf(query),
    pageSize: query.pageSize,
  };
}

/** Builds the typed criteria; the schema has already proven every field well-formed. */
export function toOneWayCriteria(query: OneWaySearchQuery): OneWayCriteria {
  return { ...sharedCriteria(query), sort: query.sort, page: query.page };
}

export function toRoundTripCriteria(query: RoundTripSearchQuery): RoundTripCriteria {
  return {
    ...sharedCriteria(query),
    returnDate: query.returnDate,
    outboundSort: query.outboundSort,
    inboundSort: query.inboundSort,
    outboundPage: query.outboundPage,
    inboundPage: query.inboundPage,
  };
}
