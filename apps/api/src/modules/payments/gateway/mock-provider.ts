import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MockChargeEntity } from './mock-charge.entity';
import { MockRefundEntity } from './mock-refund.entity';

/**
 * The provider's own vocabulary (field names, states, decline codes). It is deliberately not our
 * PaymentGateway interface, as a real provider's would not be.
 */
export type ProviderPayment =
  | { id: string; state: 'captured'; card: { network: string; last_four: string } }
  | { id: string; state: 'declined'; decline_code: 'insufficient_funds' | 'invalid_source' }
  | { id: string; state: 'voided' };

export interface ProviderRefund {
  id: string;
  state: 'refunded' | 'rejected';
}

export interface CreatePayment {
  source: string;
  amount_cents: number;
  currency: string;
  merchant_reference: string;
}

export interface CreateRefund {
  payment_id: string;
  amount_cents: number;
  currency: string;
  merchant_reference: string;
}

/** The provider did not answer in time. The payment may still have been captured. */
export class ProviderTimeout extends Error {
  constructor() {
    super('The provider did not answer in time');
    this.name = 'ProviderTimeout';
  }
}

const SOURCES = new Map<string, MockChargeEntity['outcome']>([
  ['tok_success', 'SUCCEEDED'],
  ['tok_declined', 'DECLINED'],
  ['tok_timeout', 'SUCCEEDED'],
]);

/**
 * Adapter pattern, Adaptee: a simulated payment provider. It keeps its own records, commits
 * independently of Booking and remembers outcomes across restarts, like a real provider.
 */
@Injectable()
export class MockProvider {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** tok_timeout captures the payment and then fails to answer, so only a later lookup can tell. */
  async createPayment(request: CreatePayment): Promise<ProviderPayment> {
    const outcome = SOURCES.get(request.source) ?? 'UNKNOWN';
    const payment = await this.record(request.merchant_reference, outcome);
    if (request.source === 'tok_timeout' && payment.state === 'captured') {
      throw new ProviderTimeout();
    }
    return payment;
  }

  /** A reference the provider never saw is voided, so a late createPayment cannot capture it. */
  retrievePayment(merchantReference: string): Promise<ProviderPayment> {
    return this.record(merchantReference, 'NOT_CHARGED');
  }

  /** One refund per payment; repeating a merchant reference returns the same refund. */
  async createRefund(request: CreateRefund): Promise<ProviderRefund> {
    const records = this.db.getRepository(MockRefundEntity);
    await records
      .createQueryBuilder()
      .insert()
      .values({ refundId: request.merchant_reference, chargeRef: request.payment_id })
      .orIgnore()
      .execute();
    const stored = await records.findOneBy({ refundId: request.merchant_reference });
    const id = `mock-refund-${request.merchant_reference}`;
    return { id, state: stored?.chargeRef === request.payment_id ? 'refunded' : 'rejected' };
  }

  private async record(
    reference: string,
    outcome: MockChargeEntity['outcome'],
  ): Promise<ProviderPayment> {
    const records = this.db.getRepository(MockChargeEntity);
    await records
      .createQueryBuilder()
      .insert()
      .values({ paymentId: reference, outcome })
      .orIgnore()
      .execute();
    const stored = await records.findOneByOrFail({ paymentId: reference });
    const id = `mock-${reference}`;
    if (stored.outcome === 'SUCCEEDED') {
      return { id, state: 'captured', card: { network: 'visa', last_four: '4242' } };
    }
    if (stored.outcome === 'NOT_CHARGED') return { id, state: 'voided' };
    const code = stored.outcome === 'DECLINED' ? 'insufficient_funds' : 'invalid_source';
    return { id, state: 'declined', decline_code: code };
  }
}
