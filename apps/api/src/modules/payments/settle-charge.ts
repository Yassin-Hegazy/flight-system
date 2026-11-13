import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { publishDomainEvent } from '../../shared/events';
import { BOOKING_PAYMENTS, type BookingPayments } from '../booking/index';
import type { SuccessfulCharge } from './gateway/payment-gateway';
import { PaymentsRepository } from './payments.repository';
import { RefundPayments } from './refund-payments';

@Injectable()
export class SettleCharge {
  private readonly logger = new Logger(SettleCharge.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(BOOKING_PAYMENTS) private readonly booking: BookingPayments,
    private readonly payments: PaymentsRepository,
    private readonly refunds: RefundPayments,
    private readonly events: EventEmitter2,
  ) {}

  async execute(id: string, charge: SuccessfulCharge): Promise<void> {
    const outcome = await this.db.transaction('READ COMMITTED', async (tx) => {
      const payment = await this.payments.lock(tx, id);
      if (!payment || payment.status !== 'PENDING') return null;

      const confirmation = await this.booking.confirmPaid(tx, payment.bookingId, id);
      await this.payments.succeed(tx, id, charge, confirmation.ok ? null : 'HOLD_EXPIRED');
      if (confirmation.ok) return confirmation;
      await this.refunds.record(tx, payment, 'NOT_CONFIRMED');
      return confirmation;
    });

    if (!outcome) return;
    if (!outcome.ok) {
      await this.refunds.sendForPayment(id);
      return;
    }
    try {
      await publishDomainEvent(this.events, outcome.value);
    } catch {
      this.logger.warn({ paymentId: id }, 'Booking confirmed, but an observer failed');
    }
  }
}
