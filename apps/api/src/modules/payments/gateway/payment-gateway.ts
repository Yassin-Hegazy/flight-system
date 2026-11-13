import type { Money } from '../../../shared/money';

export type DeclineReason = 'insufficient_funds' | 'unknown_token' | 'no_charge';
export type ChargeResult =
  | { status: 'SUCCEEDED'; gatewayRef: string; brand: string; last4: string }
  | { status: 'DECLINED'; reason: DeclineReason }
  | { status: 'UNAVAILABLE' };

export type SuccessfulCharge = Extract<ChargeResult, { status: 'SUCCEEDED' }>;

export interface ChargeRequest {
  token: string;
  amount: Money;
  idempotencyKey: string;
}

export interface RefundRequest {
  gatewayRef: string;
  amount: Money;
  idempotencyKey: string;
}

export interface PaymentGateway {
  charge(request: ChargeRequest): Promise<ChargeResult>;
  /** A decline is definitive. Use UNAVAILABLE whenever the outcome could still change. */
  lookup(idempotencyKey: string): Promise<ChargeResult>;
  /** Repeating a key must return the same refund without moving money again. */
  refund(request: RefundRequest): Promise<{ gatewayRef: string } | false>;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
