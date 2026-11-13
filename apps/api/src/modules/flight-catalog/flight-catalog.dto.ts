import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  Length,
  Matches,
  type ValidationOptions,
  registerDecorator,
} from 'class-validator';
import { isLocalDate } from '../../shared/time';

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

export class FlightRouteQuery {
  @ApiProperty({ example: 'CAI', description: '3-letter IATA code.' })
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: '$property must be a 3-letter IATA airport code' })
  origin!: string;

  @ApiProperty({ example: 'LHR', description: '3-letter IATA code.' })
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: '$property must be a 3-letter IATA airport code' })
  destination!: string;

  /** The departure date at the origin airport. */
  @ApiProperty({
    example: '2026-12-10',
    description: 'Departure date at the origin airport, YYYY-MM-DD.',
  })
  @IsLocalDate()
  date!: string;
}

export class AirportSearchQuery {
  @ApiPropertyOptional({ example: 'cai', description: 'Part of a code, name or city.' })
  @IsString()
  @Length(0, 100)
  q = '';
}
