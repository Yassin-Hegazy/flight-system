import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual } from 'typeorm';
import type { Tx } from '../../shared/db';
import {
  BOOKING_CANCELLATION_IN_TX,
  type BookingCancellationInTx,
  type BookingCancelled,
} from '../../shared/events';
import { money } from '../../shared/money';
import { PAYMENT_GATEWAY, type PaymentGateway } from './gateway/payment-gateway';
import { PaymentEntity } from './payment.entity';
import { RefundEntity } from './refund.entity';

@Injectable()
export class RefundPayments {
  private readonly logger = new Logger(RefundPayments.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  @OnEvent(BOOKING_CANCELLATION_IN_TX, { suppressErrors: false })
  async recordCancellation({ tx, paymentId }: BookingCancellationInTx): Promise<void> {
    if (!paymentId) return;
    const payment = await tx.findOneByOrFail(PaymentEntity, { id: paymentId, status: 'SUCCEEDED' });
    await this.record(tx, payment, 'CANCELLATION');
  }

  async record(tx: Tx, payment: PaymentEntity, reason: RefundEntity['reason']): Promise<void> {
    await tx
      .createQueryBuilder()
      .insert()
      .into(RefundEntity)
      .values({
        paymentId: payment.id,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        reason,
      })
      .orIgnore()
      .execute();
  }

  @OnEvent('BookingCancelled')
  async afterCancellation(event: BookingCancelled): Promise<void> {
    const payment = await this.db.manager.findOneBy(PaymentEntity, {
      bookingId: event.bookingId,
      status: 'SUCCEEDED',
    });
    if (payment) await this.sendForPayment(payment.id);
  }

  async sendForPayment(paymentId: string): Promise<void> {
    const refund = await this.db.manager.findOneBy(RefundEntity, { paymentId, status: 'PENDING' });
    if (refund) await this.send(refund.id, new Date());
  }

  async sendDue(now: Date): Promise<void> {
    const pending = await this.db.manager.find(RefundEntity, {
      where: { status: 'PENDING', retryAt: LessThanOrEqual(now) },
      order: { retryAt: 'ASC', id: 'ASC' },
      take: 50,
    });
    for (const refund of pending) await this.send(refund.id, now);
  }

  private async send(id: string, now: Date): Promise<void> {
    // Claim in one short SQL statement. An interrupted worker's lease expires.
    const claimed = await this.db.manager.update(
      RefundEntity,
      { id, status: 'PENDING', retryAt: LessThanOrEqual(now) },
      { retryAt: new Date(now.getTime() + 60_000), attempts: () => '"attempts" + 1' },
    );
    if (!claimed.affected) return;

    const refund = await this.db.manager.findOneByOrFail(RefundEntity, { id });
    const payment = await this.db.manager.findOneByOrFail(PaymentEntity, { id: refund.paymentId });
    if (!payment.gatewayRef) throw new Error('Refundable payment has no provider reference');
    const result = await this.refund(refund, payment.gatewayRef);
    if (result) {
      await this.db.manager.update(
        RefundEntity,
        { id, status: 'PENDING' },
        {
          status: 'SUCCEEDED',
          gatewayRef: result.gatewayRef,
          resolvedAt: new Date(),
        },
      );
    }
  }

  private async refund(refund: RefundEntity, gatewayRef: string) {
    try {
      return await this.gateway.refund({
        gatewayRef,
        amount: money(refund.amountMinor, refund.currency),
        idempotencyKey: refund.id,
      });
    } catch {
      this.logger.warn({ refundId: refund.id }, 'The gateway did not confirm the refund');
      return false;
    }
  }
}
