import { describe, expect, it } from 'vitest';
import { receipt } from './payment-receipt';
import { PaymentEntity } from './payment.entity';
import { RefundEntity } from './refund.entity';

const CREATED = new Date('2027-03-01T10:00:00Z');
const RESOLVED = new Date('2027-03-01T10:00:02Z');

function payment(fields: Partial<PaymentEntity>) {
  return Object.assign(new PaymentEntity(), {
    id: 'pay-1',
    amountMinor: 900_000,
    currency: 'EGP',
    createdAt: CREATED,
    resolvedAt: RESOLVED,
    declineReason: null,
    cardBrand: null,
    cardLast4: null,
    ...fields,
  });
}

describe('US-PAY-05 receipt', () => {
  it('US-PAY-05-T03 shows amount, card, times, status, reference, and a pending refund as pending', () => {
    const refund = Object.assign(new RefundEntity(), {
      status: 'PENDING',
      amountMinor: 900_000,
      currency: 'EGP',
      resolvedAt: null,
    });

    const view = receipt(
      'K7M2QP',
      payment({
        status: 'SUCCEEDED',
        cardBrand: 'VISA',
        cardLast4: '4242',
        gatewayRef: 'ref-1',
        idempotencyKey: 'key-1',
      }),
      refund,
    );

    expect(view).toEqual({
      id: 'pay-1',
      status: 'SUCCEEDED',
      amount: { amountMinor: 900_000, currency: 'EGP' },
      card: { brand: 'VISA', last4: '4242' },
      bookingReference: 'K7M2QP',
      createdAt: CREATED,
      resolvedAt: RESOLVED,
      declineReason: null,
      refund: {
        status: 'PENDING',
        amount: { amountMinor: 900_000, currency: 'EGP' },
        resolvedAt: null,
      },
    });
  });

  it('US-PAY-05-T04 a declined attempt shows its reason and no card', () => {
    const view = receipt(
      'K7M2QP',
      payment({ status: 'FAILED', declineReason: 'insufficient_funds' }),
      null,
    );

    expect(view).toMatchObject({
      status: 'FAILED',
      declineReason: 'insufficient_funds',
      refund: null,
    });
    expect(view).not.toHaveProperty('card');
  });
});
