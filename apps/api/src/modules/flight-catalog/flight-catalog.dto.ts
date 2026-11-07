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
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: '$property must be a 3-letter IATA airport code' })
  origin!: string;

  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: '$property must be a 3-letter IATA airport code' })
  destination!: string;

  /** The departure date at the origin airport. */
  @IsLocalDate()
  date!: string;
}

export class AirportSearchQuery {
  @IsString()
  @Length(0, 100)
  q = '';
}
