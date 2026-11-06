import { IsDateString, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { FlightStatus, type Cabin } from './flight-catalog.domain';

export class FlightRouteQuery {
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Za-z]{3}$/)
  origin!: string;

  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Za-z]{3}$/)
  destination!: string;

  @IsDateString()
  date!: string;
}

export class AirportSearchQuery {
  @IsString()
  @Length(0, 100)
  q = '';
}

export class ChangeFlightStatusInput {
  @IsIn(Object.values(FlightStatus))
  status!: FlightStatus;

  @IsOptional()
  @IsDateString()
  estimatedDepartureUtc?: string;
}

export class FareInput {
  @IsIn(['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'] satisfies Cabin[])
  cabin!: Cabin;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
}
