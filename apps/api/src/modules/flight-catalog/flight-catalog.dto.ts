import { IsDateString, IsString, Length, Matches } from 'class-validator';

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
