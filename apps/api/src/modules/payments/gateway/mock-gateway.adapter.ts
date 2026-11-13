import { Injectable } from '@nestjs/common';
import type {
  ChargeRequest,
  ChargeResult,
  DeclineReason,
  PaymentGateway,
  RefundRequest,
} from './payment-gateway';
import { MockProvider, ProviderTimeout, type ProviderPayment } from './mock-provider';

const DECLINES: Record<'insufficient_funds' | 'invalid_source', DeclineReason> = {
  insufficient_funds: 'insufficient_funds',
  invalid_source: 'unknown_token',
};

/**
 * Adapter pattern, Adapter: makes MockProvider (the Adaptee) usable as a PaymentGateway (the
 * Target). It only translates names, shapes and states; it decides nothing about bookings.
 */
@Injectable()
export class MockGatewayAdapter implements PaymentGateway {
  constructor(private readonly provider: MockProvider) {}

  async charge({ token, amount, idempotencyKey }: ChargeRequest): Promise<ChargeResult> {
    try {
      const payment = await this.provider.createPayment({
        source: token,
        amount_cents: amount.amountMinor,
        currency: amount.currency,
        merchant_reference: idempotencyKey,
      });
      return toChargeResult(payment);
    } catch (error) {
      // A timeout is not a decline: the provider may have captured the money.
      if (error instanceof ProviderTimeout) return { status: 'UNAVAILABLE' };
      throw error;
    }
  }

  async lookup(idempotencyKey: string): Promise<ChargeResult> {
    return toChargeResult(await this.provider.retrievePayment(idempotencyKey));
  }

  async refund({
    gatewayRef,
    amount,
    idempotencyKey,
  }: RefundRequest): Promise<{ gatewayRef: string } | false> {
    const refund = await this.provider.createRefund({
      payment_id: gatewayRef,
      amount_cents: amount.amountMinor,
      currency: amount.currency,
      merchant_reference: idempotencyKey,
    });
    return refund.state === 'refunded' ? { gatewayRef: refund.id } : false;
  }
}

function toChargeResult(payment: ProviderPayment): ChargeResult {
  switch (payment.state) {
    case 'captured':
      return {
        status: 'SUCCEEDED',
        gatewayRef: payment.id,
        brand: payment.card.network.toUpperCase(),
        last4: payment.card.last_four,
      };
    case 'declined':
      return { status: 'DECLINED', reason: DECLINES[payment.decline_code] };
    case 'voided':
      return { status: 'DECLINED', reason: 'no_charge' };
  }
}
