import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MockChargeEntity } from './mock-charge.entity';
import { MockRefundEntity } from './mock-refund.entity';
import type { ChargeRequest, ChargeResult, PaymentGateway, RefundRequest } from './payment-gateway';

const OUTCOMES = new Map<string, MockChargeEntity['outcome']>([
  ['tok_success', 'SUCCEEDED'],
  ['tok_declined', 'DECLINED'],
  ['tok_timeout', 'SUCCEEDED'],
]);

/** The simulated provider commits independently of Booking and retains outcomes across restarts. */
@Injectable()
export class MockGatewayAdapter implements PaymentGateway {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async charge({ token, idempotencyKey }: ChargeRequest): Promise<ChargeResult> {
    const result = await this.resolve(idempotencyKey, OUTCOMES.get(token) ?? 'UNKNOWN');
    return token === 'tok_timeout' && result.status === 'SUCCEEDED'
      ? { status: 'UNAVAILABLE' }
      : result;
  }

  lookup(idempotencyKey: string): Promise<ChargeResult> {
    // A lookup racing a never-started charge closes its key. A late charge can't reopen it.
    return this.resolve(idempotencyKey, 'NOT_CHARGED');
  }

  async refund({
    idempotencyKey,
    gatewayRef,
  }: RefundRequest): Promise<{ gatewayRef: string } | false> {
    const records = this.db.getRepository(MockRefundEntity);
    await records
      .createQueryBuilder()
      .insert()
      .values({ refundId: idempotencyKey, chargeRef: gatewayRef })
      .orIgnore()
      .execute();
    const stored = await records.findOneBy({ refundId: idempotencyKey });
    return stored?.chargeRef === gatewayRef
      ? { gatewayRef: `mock-refund-${idempotencyKey}` }
      : false;
  }

  private async resolve(
    paymentId: string,
    outcome: MockChargeEntity['outcome'],
  ): Promise<ChargeResult> {
    const records = this.db.getRepository(MockChargeEntity);
    await records.createQueryBuilder().insert().values({ paymentId, outcome }).orIgnore().execute();
    const stored = await records.findOneByOrFail({ paymentId });
    if (stored.outcome === 'SUCCEEDED') {
      return { status: 'SUCCEEDED', gatewayRef: `mock-${paymentId}`, brand: 'VISA', last4: '4242' };
    }
    const reasons = {
      DECLINED: 'insufficient_funds',
      UNKNOWN: 'unknown_token',
      NOT_CHARGED: 'no_charge',
    } as const;
    return { status: 'DECLINED', reason: reasons[stored.outcome] };
  }
}
