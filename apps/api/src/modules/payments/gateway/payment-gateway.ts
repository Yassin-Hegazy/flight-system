import type { Money } from '../../../shared/money';

export type ChargeResult =
  | { status: 'SUCCEEDED'; gatewayRef: string; brand: string; last4: string }
  | { status: 'DECLINED' }
  | { status: 'UNAVAILABLE' };

export interface ChargeRequest {
  token: string;
  amount: Money;
  idempotencyKey: string;
}

export interface PaymentGateway {
  charge(request: ChargeRequest): Promise<ChargeResult>;
  refund(request: { gatewayRef: string; amount: Money; idempotencyKey: string }): Promise<boolean>;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
