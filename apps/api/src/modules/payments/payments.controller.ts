import {
  Body,
  Controller,
  Get,
  Headers,
  Header,
  Inject,
  Param,
  Post,
  Res,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { ApiSession } from '../../shared/api-docs';
import type { Response } from 'express';
import { AppError, fieldErrorsFrom, validationError } from '../../shared/errors';
import {
  Action,
  Ctx,
  type RequestContext,
  signedIn,
  UserRole,
  WithRole,
} from '../users-access/index';
import { BOOKING_PAYMENTS, type BookingPayments } from '../booking/index';
import { PaymentsRepository } from './payments.repository';
import { receipt } from './payment-receipt';
import { PayForBooking } from './pay-for-booking';

class PayBody {
  @ApiProperty({ example: 'tok_success' })
  @Matches(/^tok_[a-z0-9_-]{1,80}$/i)
  token!: string;
}

const PAYMENT_BODY = new ValidationPipe({
  expectedType: PayBody,
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  exceptionFactory: (errors) => validationError(fieldErrorsFrom(errors)),
});

const PAYMENT_ERRORS = {
  NOT_FOUND: () => AppError.notFound('NOT_FOUND', 'Not found.'),
  ALREADY_PAID: () => AppError.conflict('ALREADY_PAID', 'This booking is already paid.'),
  HOLD_EXPIRED: () => AppError.conflict('HOLD_EXPIRED', 'The seat hold expired.'),
  KEY_REUSED: () =>
    AppError.conflict('KEY_REUSED', 'Use a new key for a different payment request.'),
  IN_PROGRESS: () => AppError.conflict('IN_PROGRESS', 'Another payment is in progress.'),
};

@ApiTags('Payments')
@Controller('bookings')
export class PaymentsController {
  constructor(
    private readonly payForBooking: PayForBooking,
    @Inject(BOOKING_PAYMENTS) private readonly booking: BookingPayments,
    private readonly payments: PaymentsRepository,
  ) {}

  @Post(':reference/payments')
  @ApiOperation({ summary: 'Pay for your pending booking using a mock payment token' })
  @ApiBody({ type: PayBody })
  @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'checkout-1' })
  @ApiCreatedResponse({ description: 'The payment succeeded and the booking was confirmed.' })
  @ApiAcceptedResponse({ description: 'The payment attempt is still pending.' })
  @ApiSession(400, 403, 404, 409)
  pay(
    @Ctx() ctx: RequestContext,
    @Param('reference') reference: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body(PAYMENT_BODY) body: { token: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const action = new Action(async () => {
      if (!key || !/^[\w.-]{1,100}$/.test(key)) {
        throw validationError({
          'idempotency-key': 'Use 1 to 100 letters, digits, periods, underscores or hyphens.',
        });
      }
      const result = await this.payForBooking.execute({
        reference: reference.toUpperCase(),
        payerId: signedIn(ctx).id,
        token: body.token,
        idempotencyKey: key,
      });
      if (!result.ok) {
        const error = result.error;
        if (error.code === 'DECLINED') {
          throw AppError.badRequest('DECLINED', 'The gateway declined this payment.', {
            reason: error.reason,
          });
        }
        throw PAYMENT_ERRORS[error.code]();
      }
      response.status(result.value.status === 'PENDING' ? 202 : 201);
      return result.value;
    });
    return new WithRole(action, UserRole.Traveler).execute(ctx, undefined);
  }
  @Get(':reference/receipt')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read your payment receipt and refund status' })
  @ApiOkResponse({ description: 'Amount, card brand and last four, times, status and any refund.' })
  @ApiSession(403, 404)
  getReceipt(@Ctx() ctx: RequestContext, @Param('reference') rawReference: string) {
    const action = new Action(async () => {
      const reference = rawReference.toUpperCase();
      const payerId = signedIn(ctx).id;
      const bookingId = await this.booking.ownedId(reference, payerId);
      const result = bookingId && (await this.payments.receipt(bookingId, payerId));
      if (!result) throw AppError.notFound('NOT_FOUND', 'Not found.');
      return receipt(reference, result.payment, result.refund);
    });
    return new WithRole(action, UserRole.Traveler).execute(ctx, undefined);
  }
}
