import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';
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
import { BookingService } from './booking.service';

class ReserveSeatBody {
  @ApiProperty({ format: 'uuid', description: 'Flight ID from GET /flights' })
  @IsUUID()
  flightId!: string;

  @ApiProperty({ enum: [...CABINS], example: 'ECONOMY' })
  @IsIn(CABINS)
  cabin!: Cabin;
}

@ApiTags('Booking')
@Controller('bookings')
export class BookingController {
  constructor(private readonly bookings: BookingService) {}

  @Post()
  @ApiOperation({ summary: 'Reserve one adult seat for checkout' })
  reserve(@Ctx() ctx: RequestContext, @Body() body: ReserveSeatBody) {
    const action = new Action(() =>
      this.bookings.reserve(signedIn(ctx).id, body.flightId, body.cabin),
    );
    return new WithRole(action, UserRole.Traveler).execute(ctx, undefined);
  }

  @Get(':reference')
  @ApiOperation({ summary: 'Read your booking status and fare snapshot' })
  read(@Ctx() ctx: RequestContext, @Param('reference') reference: string) {
    const action = new Action(async () => {
      const booking = await this.bookings.getOwned(reference.toUpperCase(), signedIn(ctx).id);
      if (!booking) throw AppError.notFound('NOT_FOUND', 'Not found.');
      return booking;
    });
    return new WithRole(action, UserRole.Traveler).execute(ctx, undefined);
  }
}
