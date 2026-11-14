import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { AppError } from '../../shared/errors';
import { CABINS, type Cabin } from '../flight-catalog/index';
import {
  Action,
  Ctx,
  type RequestContext,
  signedIn,
  UserRole,
  WithRole,
} from '../users-access/index';
import { BookingQueries } from './booking-queries';
import { CancelBookings } from './cancel-bookings';
import { CreateBooking } from './create-booking';
import { MAX_PASSENGERS, type PassengerKind } from './passenger-rules';

const KINDS: readonly PassengerKind[] = ['ADULT', 'CHILD', 'INFANT'];

class PassengerBody {
  @ApiProperty({ example: 'Abdel-Rahman' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: "O'Neil" })
  @IsString()
  lastName!: string;

  @ApiProperty({ example: '1990-05-01', description: 'YYYY-MM-DD' })
  @IsString()
  birthDate!: string;

  @ApiProperty({ enum: KINDS, example: 'ADULT' })
  @IsIn(KINDS)
  type!: PassengerKind;
}

class CreateBookingBody {
  @ApiProperty({ format: 'uuid', description: 'Flight ID from GET /flights' })
  @IsUUID()
  flightId!: string;

  @ApiProperty({ enum: [...CABINS], example: 'ECONOMY' })
  @IsIn(CABINS)
  cabin!: Cabin;

  @ApiPropertyOptional({
    type: [PassengerBody],
    description: `1 to ${MAX_PASSENGERS} passengers. Without it, the signed-in user travels alone.`,
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PASSENGERS)
  @ValidateNested({ each: true })
  @Type(() => PassengerBody)
  passengers?: PassengerBody[];

  @ApiPropertyOptional({
    description:
      'The total (minor units) the client displayed; a different current total is a 409.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayedTotal?: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'For a round trip: the return flight, on the reverse route after the outbound lands.',
  })
  @IsOptional()
  @IsUUID()
  returnFlightId?: string;
}

function validKey(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const key = raw.trim();
  if (key.length === 0 || key.length > 100) {
    throw AppError.badRequest(
      'IDEMPOTENCY_KEY_INVALID',
      'Idempotency-Key must be 1 to 100 characters.',
    );
  }
  return key;
}

@ApiTags('Booking')
@Controller('bookings')
export class BookingController {
  constructor(
    private readonly creation: CreateBooking,
    private readonly queries: BookingQueries,
    private readonly cancellations: CancelBookings,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Book a flight for your passengers (held for payment)' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'A UUID per checkout. Resubmitting it returns the original booking for 24 hours.',
  })
  create(
    @Ctx() ctx: RequestContext,
    @Body() body: CreateBookingBody,
    @Headers('idempotency-key') key?: string,
  ) {
    const action = new Action(() => {
      // The owner always comes from the session, never from the request body (US-BK-01 AC-6).
      const { id, name } = signedIn(ctx);
      return this.creation.execute(
        {
          ownerId: id,
          ownerName: name,
          flightId: body.flightId,
          cabin: body.cabin,
          passengers: body.passengers,
          displayedTotal: body.displayedTotal,
          returnFlightId: body.returnFlightId,
        },
        validKey(key),
      );
    });
    return new WithRole(action, UserRole.Traveler).execute(ctx, undefined);
  }

  @Get()
  @ApiOperation({ summary: 'List your bookings, split into upcoming and past' })
  list(@Ctx() ctx: RequestContext, @Query('includeExpired') includeExpired?: string) {
    const action = new Action(() =>
      this.queries.listMine(signedIn(ctx).id, { includeExpired: includeExpired === 'true' }),
    );
    return new WithRole(action, UserRole.Traveler).execute(ctx, undefined);
  }

  @Get(':reference')
  @ApiOperation({ summary: 'Read your booking: status, passengers, fare snapshot and history' })
  read(@Ctx() ctx: RequestContext, @Param('reference') reference: string) {
    const action = new Action(async () => {
      const booking = await this.queries.getOwned(reference, signedIn(ctx).id);
      if (!booking) throw AppError.notFound('NOT_FOUND', 'Not found.');
      return booking;
    });
    return new WithRole(action, UserRole.Traveler).execute(ctx, undefined);
  }

  @Post(':reference/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel your booking (paid ones until 24 h before departure)' })
  cancel(@Ctx() ctx: RequestContext, @Param('reference') reference: string) {
    const action = new Action(() => this.cancellations.cancelOwned(reference, signedIn(ctx).id));
    return new WithRole(action, UserRole.Traveler).execute(ctx, undefined);
  }
}
