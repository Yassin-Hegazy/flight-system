import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDefined,
  IsInt,
  IsObject,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { POSTGRES_INTEGER_MAX } from '../../shared/db';
import { FlightTemplateBody, MAX_CABIN_CAPACITY } from './administration.dto';

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
