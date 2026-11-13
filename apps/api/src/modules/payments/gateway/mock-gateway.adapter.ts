import { Injectable } from '@nestjs/common';
import type { ChargeRequest, ChargeResult, PaymentGateway, RefundRequest } from './payment-gateway';
import { MockProvider } from './mock-provider';

/** Adapter pattern, Adapter: makes MockProvider (the Adaptee) usable as a PaymentGateway (the Target). */
@Injectable()
export class MockGatewayAdapter implements PaymentGateway {
  constructor(private readonly provider: MockProvider) {}

  charge(request: ChargeRequest): Promise<ChargeResult> {
    void request;
    return Promise.reject(new Error('Not implemented'));
  }

  lookup(idempotencyKey: string): Promise<ChargeResult> {
    void idempotencyKey;
    return Promise.reject(new Error('Not implemented'));
  }

  refund(request: RefundRequest): Promise<{ gatewayRef: string } | false> {
    void request;
    return Promise.reject(new Error('Not implemented'));
  }
}
