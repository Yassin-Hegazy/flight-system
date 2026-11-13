import { Injectable } from '@nestjs/common';

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

/** Adapter pattern, Adaptee: a simulated payment provider. */
@Injectable()
export class MockProvider {
  createPayment(): Promise<ProviderPayment> {
    return Promise.reject(new Error('Not implemented'));
  }

  retrievePayment(): Promise<ProviderPayment> {
    return Promise.reject(new Error('Not implemented'));
  }

  createRefund(): Promise<ProviderRefund> {
    return Promise.reject(new Error('Not implemented'));
  }
}
