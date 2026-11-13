import { Injectable } from '@nestjs/common';
import type { ChargeRequest, ChargeResult, PaymentGateway } from './payment-gateway';

const OUTCOMES = new Map<string, ChargeResult['status']>([
  ['tok_success', 'SUCCEEDED'],
  ['tok_declined', 'DECLINED'],
  ['tok_timeout', 'UNAVAILABLE'],
]);

@Injectable()
export class MockGatewayAdapter implements PaymentGateway {
  charge({ token, idempotencyKey }: ChargeRequest): Promise<ChargeResult> {
    const status = OUTCOMES.get(token) ?? 'DECLINED';
    if (status === 'SUCCEEDED') {
      return Promise.resolve({
        status,
        gatewayRef: `mock-${idempotencyKey}`,
        brand: 'VISA',
        last4: '4242',
      });
    }
    return Promise.resolve({ status });
  }

  refund(): Promise<boolean> {
    return Promise.resolve(true);
  }
}
