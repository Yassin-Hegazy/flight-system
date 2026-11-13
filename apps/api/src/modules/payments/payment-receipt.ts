import { money } from '../../shared/money';
import type { PaymentEntity } from './payment.entity';
import type { RefundEntity } from './refund.entity';

export function paymentView(payment: PaymentEntity) {
  return {
    id: payment.id,
    status: payment.status,
    amount: money(payment.amountMinor, payment.currency),
    ...(payment.cardBrand && payment.cardLast4
      ? { card: { brand: payment.cardBrand, last4: payment.cardLast4 } }
      : {}),
  };
}

export function receipt(reference: string, payment: PaymentEntity, refund: RefundEntity | null) {
  return {
    ...paymentView(payment),
    bookingReference: reference,
    createdAt: payment.createdAt,
    resolvedAt: payment.resolvedAt,
    declineReason: payment.declineReason,
    refund: refund && {
      status: refund.status,
      amount: money(refund.amountMinor, refund.currency),
      resolvedAt: refund.resolvedAt,
    },
  };
}
