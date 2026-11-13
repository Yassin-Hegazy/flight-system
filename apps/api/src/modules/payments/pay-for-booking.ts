import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { publishDomainEvent } from '../../shared/events';
import { money } from '../../shared/money';
import { err, ok, type Result } from '../../shared/result';
import { BOOKING_PAYMENTS, type BookingPayments } from '../booking/index';
import { PAYMENT_GATEWAY, type PaymentGateway, type ChargeResult } from './gateway/payment-gateway';
import type { PaymentEntity } from './payment.entity';
import { PaymentsRepository } from './payments.repository';

interface PayRequest {
  reference: string;
  payerId: string;
  token: string;
  idempotencyKey: string;
}

type PayError =
  'NOT_FOUND' | 'ALREADY_PAID' | 'HOLD_EXPIRED' | 'DECLINED' | 'KEY_REUSED' | 'IN_PROGRESS';

function paymentView(payment: PaymentEntity) {
  return {
    id: payment.id,
    status: payment.status,
    amount: money(payment.amountMinor, payment.currency),
    ...(payment.cardBrand && payment.cardLast4
      ? { card: { brand: payment.cardBrand, last4: payment.cardLast4 } }
      : {}),
  };
}

type PayResult = Result<ReturnType<typeof paymentView>, PayError>;

@Injectable()
export class PayForBooking {
  private readonly logger = new Logger(PayForBooking.name);

  constructor(
    private readonly payments: PaymentsRepository,
    @Inject(BOOKING_PAYMENTS) private readonly booking: BookingPayments,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @InjectDataSource() private readonly db: DataSource,
    private readonly events: EventEmitter2,
  ) {}

  async execute(request: PayRequest): Promise<PayResult> {
    const { reference, payerId, token, idempotencyKey } = request;
    const hash = createHash('sha256')
      .update(JSON.stringify([reference, token]))
      .digest('hex');
    const previous = await this.payments.findByKey(payerId, idempotencyKey);
    if (previous) return this.replay(previous, hash);

    const payable = await this.booking.getPayable(reference, payerId);
    if (!payable.ok) {
      const raced = await this.payments.findByKey(payerId, idempotencyKey);
      return raced ? this.replay(raced, hash) : err(payable.error);
    }
    const { bookingId, amount } = payable.value;
    const attempt = await this.payments.start({
      bookingId,
      payerId,
      idempotencyKey,
      requestHash: hash,
      ...amount,
    });
    if (!attempt) return this.replayRace(request, bookingId, hash);

    const charge = await this.charge(token, amount, attempt.id);
    if (charge.status === 'UNAVAILABLE') return ok(paymentView(attempt));
    if (charge.status === 'DECLINED') {
      await this.payments.fail(attempt.id, 'DECLINED');
      return err('DECLINED');
    }
    return this.settle(attempt, charge);
  }

  private async charge(token: string, amount: ReturnType<typeof money>, id: string) {
    try {
      return await this.gateway.charge({ token, amount, idempotencyKey: id });
    } catch {
      this.logger.warn({ paymentId: id }, 'The gateway did not confirm the charge');
      return { status: 'UNAVAILABLE' } as const;
    }
  }

  private replay(payment: PaymentEntity, hash: string): PayResult {
    if (payment.requestHash !== hash) return err('KEY_REUSED');
    if (payment.failureCode) return err(payment.failureCode);
    return ok(paymentView(payment));
  }

  private async replayRace(
    request: PayRequest,
    bookingId: string,
    hash: string,
  ): Promise<PayResult> {
    const sameKey = await this.payments.findByKey(request.payerId, request.idempotencyKey);
    if (sameKey) return this.replay(sameKey, hash);
    const live = await this.payments.findLive(bookingId);
    return err(live?.status === 'SUCCEEDED' ? 'ALREADY_PAID' : 'IN_PROGRESS');
  }

  private async settle(
    attempt: PaymentEntity,
    charge: Extract<ChargeResult, { status: 'SUCCEEDED' }>,
  ): Promise<PayResult> {
    const confirmation = await this.db.transaction('READ COMMITTED', async (tx) => {
      const booking = await this.booking.confirmPaid(tx, attempt.bookingId, attempt.id);
      if (booking.ok) await this.payments.succeed(tx, attempt.id, charge);
      return booking;
    });
    if (!confirmation.ok) return this.refundExpired(attempt, charge.gatewayRef);

    try {
      await publishDomainEvent(this.events, confirmation.value);
    } catch {
      this.logger.warn({ paymentId: attempt.id }, 'Booking confirmed, but an observer failed');
    }
    return ok(
      paymentView({
        ...attempt,
        status: 'SUCCEEDED',
        cardBrand: charge.brand,
        cardLast4: charge.last4,
      }),
    );
  }

  private async refundExpired(attempt: PaymentEntity, gatewayRef: string): Promise<PayResult> {
    await this.payments.rememberUnconfirmedCharge(attempt.id, gatewayRef);
    try {
      const refunded = await this.gateway.refund({
        gatewayRef,
        amount: money(attempt.amountMinor, attempt.currency),
        idempotencyKey: attempt.id,
      });
      if (!refunded) return ok(paymentView(attempt));
    } catch {
      this.logger.warn({ paymentId: attempt.id }, 'The gateway did not confirm the refund');
      return ok(paymentView(attempt));
    }
    await this.payments.fail(attempt.id, 'HOLD_EXPIRED');
    return err('HOLD_EXPIRED');
  }
}
