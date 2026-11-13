import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { isUniqueViolation, type Tx } from '../../shared/db';
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

  findLive(bookingId: string) {
    return this.db.manager.findOneBy(PaymentEntity, [
      { bookingId, status: 'PENDING' },
      { bookingId, status: 'SUCCEEDED' },
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

  async succeed(tx: Tx, id: string, card: { gatewayRef: string; brand: string; last4: string }) {
    await tx.update(PaymentEntity, id, {
      status: 'SUCCEEDED',
      gatewayRef: card.gatewayRef,
      cardBrand: card.brand,
      cardLast4: card.last4,
    });
  }

  async rememberUnconfirmedCharge(id: string, gatewayRef: string) {
    await this.db.manager.update(PaymentEntity, { id, status: 'PENDING' }, { gatewayRef });
  }

  async fail(id: string, failureCode: NonNullable<PaymentEntity['failureCode']>) {
    await this.db.manager.update(
      PaymentEntity,
      { id, status: 'PENDING' },
      {
        status: 'FAILED',
        failureCode,
      },
    );
  }
}
