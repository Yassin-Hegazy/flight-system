import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { isUniqueViolation, type Tx } from '../../shared/db';
import type { DeclineReason } from './gateway/payment-gateway';
import { RefundEntity } from './refund.entity';
import { PaymentEntity } from './payment.entity';

type NewAttempt = Pick<
  PaymentEntity,
  'bookingId' | 'payerId' | 'idempotencyKey' | 'requestHash' | 'amountMinor' | 'currency'
>;

@Injectable()
export class PaymentsRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  findByKey(payerId: string, idempotencyKey: string) {
    return this.db.manager.findOneBy(PaymentEntity, { payerId, idempotencyKey });
  }

  findLive(bookingId: string, payerId: string) {
    return this.db.manager.findOneBy(PaymentEntity, [
      { bookingId, payerId, status: 'PENDING' },
      { bookingId, payerId, status: 'SUCCEEDED' },
    ]);
  }

  async start(attempt: NewAttempt) {
    try {
      return await this.db.manager.save(PaymentEntity, { ...attempt, status: 'PENDING' });
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  async succeed(
    tx: Tx,
    id: string,
    card: { gatewayRef: string; brand: string; last4: string },
    failureCode: 'HOLD_EXPIRED' | null,
  ) {
    await tx.update(PaymentEntity, id, {
      status: 'SUCCEEDED',
      resolvedAt: new Date(),
      failureCode,
      gatewayRef: card.gatewayRef,
      cardBrand: card.brand,
      cardLast4: card.last4,
    });
  }

  findById(id: string) {
    return this.db.manager.findOneByOrFail(PaymentEntity, { id });
  }

  lock(tx: Tx, id: string) {
    return tx.findOne(PaymentEntity, { where: { id }, lock: { mode: 'pessimistic_write' } });
  }

  async fail(id: string, declineReason: DeclineReason) {
    await this.db.manager.update(
      PaymentEntity,
      { id, status: 'PENDING' },
      {
        status: 'FAILED',
        failureCode: 'DECLINED',
        declineReason,
        resolvedAt: new Date(),
      },
    );
  }

  async claimRecoveries(now: Date) {
    return this.db.transaction(async (tx) => {
      const attempts = await tx.find(PaymentEntity, {
        where: { status: 'PENDING', recoveryAt: LessThanOrEqual(now) },
        order: { recoveryAt: 'ASC', id: 'ASC' },
        take: 50,
        lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
      });
      if (attempts.length) {
        await tx.update(
          PaymentEntity,
          attempts.map(({ id }) => id),
          {
            recoveryAt: new Date(now.getTime() + 60_000),
          },
        );
      }
      return attempts;
    });
  }

  async receipt(bookingId: string, payerId: string) {
    const payment = await this.db.manager.findOne(PaymentEntity, {
      where: { bookingId, payerId },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    if (!payment) return null;
    // A live payment is the receipt when a booking has multiple attempts.
    const current = (await this.findLive(bookingId, payerId)) ?? payment;
    const refund = await this.db.manager.findOneBy(RefundEntity, { paymentId: current.id });
    return { payment: current, refund };
  }
}
