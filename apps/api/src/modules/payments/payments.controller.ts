import { Body, Controller, Headers, Param, Post, Res, ValidationPipe } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { Matches } from 'class-validator';
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
  DECLINED: () => AppError.badRequest('DECLINED', 'The gateway declined this payment.'),
  KEY_REUSED: () =>
    AppError.conflict('KEY_REUSED', 'Use a new key for a different payment request.'),
  IN_PROGRESS: () => AppError.conflict('IN_PROGRESS', 'Another payment is in progress.'),
};

@ApiTags('Payments')
@Controller('bookings')
export class PaymentsController {
  constructor(private readonly payForBooking: PayForBooking) {}

  @Post(':reference/payments')
  @ApiOperation({ summary: 'Pay for your pending booking using a mock payment token' })
  @ApiBody({ type: PayBody })
  @ApiHeader({ name: 'Idempotency-Key', required: true, example: 'checkout-1' })
  @ApiCreatedResponse({ description: 'The payment succeeded and the booking was confirmed.' })
  @ApiAcceptedResponse({ description: 'The payment attempt is still pending.' })
  @ApiConflictResponse({
    description: 'The booking is paid, the hold expired, or the key conflicts.',
  })
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
      if (!result.ok) throw PAYMENT_ERRORS[result.error]();
      response.status(result.value.status === 'PENDING' ? 202 : 201);
      return result.value;
    });
    return new WithRole(action, UserRole.Traveler).execute(ctx, undefined);
  }
}
