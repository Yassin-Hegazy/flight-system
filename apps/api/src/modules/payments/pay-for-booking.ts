import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { money } from '../../shared/money';
import { err, ok, type Result } from '../../shared/result';
import { BOOKING_PAYMENTS, type BookingPayments } from '../booking/index';
import {
  PAYMENT_GATEWAY,
  type PaymentGateway,
  type DeclineReason,
} from './gateway/payment-gateway';
import type { PaymentEntity } from './payment.entity';
import { paymentView } from './payment-receipt';
import { SettleCharge } from './settle-charge';
import { PaymentsRepository } from './payments.repository';

interface PayRequest {
  reference: string;
  payerId: string;
  token: string;
  idempotencyKey: string;
}

export type PayError =
  | { code: 'NOT_FOUND' | 'ALREADY_PAID' | 'HOLD_EXPIRED' | 'KEY_REUSED' | 'IN_PROGRESS' }
  | { code: 'DECLINED'; reason: DeclineReason };

type PayResult = Result<ReturnType<typeof paymentView>, PayError>;

@Injectable()
export class PayForBooking {
  private readonly logger = new Logger(PayForBooking.name);

  constructor(
    private readonly payments: PaymentsRepository,
    @Inject(BOOKING_PAYMENTS) private readonly booking: BookingPayments,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly settle: SettleCharge,
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
      return raced ? this.replay(raced, hash) : err({ code: payable.error });
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
      await this.payments.fail(attempt.id, charge.reason);
    } else {
      await this.settle.execute(attempt.id, charge);
    }
    return this.replay(await this.payments.findById(attempt.id), hash);
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
    if (payment.requestHash !== hash) return err({ code: 'KEY_REUSED' });
    if (payment.failureCode === 'DECLINED') {
      return err({ code: 'DECLINED', reason: payment.declineReason ?? 'no_charge' });
    }
    if (payment.failureCode === 'HOLD_EXPIRED') return err({ code: 'HOLD_EXPIRED' });
    return ok(paymentView(payment));
  }

  private async replayRace(
    request: PayRequest,
    bookingId: string,
    hash: string,
  ): Promise<PayResult> {
    const sameKey = await this.payments.findByKey(request.payerId, request.idempotencyKey);
    if (sameKey) return this.replay(sameKey, hash);
    const live = await this.payments.findLive(bookingId, request.payerId);
    return err({ code: live?.status === 'SUCCEEDED' ? 'ALREADY_PAID' : 'IN_PROGRESS' });
  }
}
