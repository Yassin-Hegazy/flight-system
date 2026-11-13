import { describe, expect, it } from 'vitest';
import { money } from '../../../shared/money';
import { MockGatewayAdapter } from './mock-gateway.adapter';
import { ProviderTimeout, type MockProvider, type ProviderPayment } from './mock-provider';

/** A stand-in Adaptee: answers in the provider's vocabulary and records what it was asked. */
function provider(
  answer: ProviderPayment | Error,
  refundState: 'refunded' | 'rejected' = 'refunded',
) {
  const calls: unknown[] = [];
  const reply = (request: unknown) => {
    calls.push(request);
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  };
  const fake = {
    calls,
    createPayment: reply,
    retrievePayment: reply,
    createRefund: (request: unknown) => {
      calls.push(request);
      return Promise.resolve({ id: 'prov-refund-1', state: refundState });
    },
  };
  return { fake, adapter: new MockGatewayAdapter(fake as unknown as MockProvider) };
}

const CHARGE = { token: 'tok_success', amount: money(900_000, 'EGP'), idempotencyKey: 'key-1' };

describe('US-PAY-01 MockGatewayAdapter (Adapter: PaymentGateway is the Target, MockProvider the Adaptee)', () => {
  it('US-PAY-01-T06 translates our charge into the provider request and a capture into SUCCEEDED', async () => {
    const { fake, adapter } = provider({
      id: 'prov-1',
      state: 'captured',
      card: { network: 'visa', last_four: '4242' },
    });

    await expect(adapter.charge(CHARGE)).resolves.toEqual({
      status: 'SUCCEEDED',
      gatewayRef: 'prov-1',
      brand: 'VISA',
      last4: '4242',
    });
    expect(fake.calls).toEqual([
      {
        source: 'tok_success',
        amount_cents: 900_000,
        currency: 'EGP',
        merchant_reference: 'key-1',
      },
    ]);
  });

  it('US-PAY-01-T07 maps each provider decline to our decline reason', async () => {
    const cases: [ProviderPayment, string][] = [
      [{ id: 'p', state: 'declined', decline_code: 'insufficient_funds' }, 'insufficient_funds'],
      [{ id: 'p', state: 'declined', decline_code: 'invalid_source' }, 'unknown_token'],
      [{ id: 'p', state: 'voided' }, 'no_charge'],
    ];
    for (const [answer, reason] of cases) {
      await expect(provider(answer).adapter.charge(CHARGE)).resolves.toEqual({
        status: 'DECLINED',
        reason,
      });
    }
  });

  it('US-PAY-01-T08 a provider timeout is UNAVAILABLE, never a decline; other errors propagate', async () => {
    await expect(provider(new ProviderTimeout()).adapter.charge(CHARGE)).resolves.toEqual({
      status: 'UNAVAILABLE',
    });
    await expect(provider(new Error('boom')).adapter.charge(CHARGE)).rejects.toThrow('boom');
  });

  it('US-PAY-01-T09 lookup asks the provider by our key and translates the answer', async () => {
    const { fake, adapter } = provider({ id: 'p', state: 'voided' });

    await expect(adapter.lookup('key-1')).resolves.toEqual({
      status: 'DECLINED',
      reason: 'no_charge',
    });
    expect(fake.calls).toEqual(['key-1']);
  });

  it('US-PAY-01-T10 a refund the provider accepts returns its reference; a rejected one is false', async () => {
    const request = { gatewayRef: 'prov-1', amount: money(900_000, 'EGP'), idempotencyKey: 'r-1' };
    const accepted = provider({ id: 'p', state: 'voided' });

    await expect(accepted.adapter.refund(request)).resolves.toEqual({
      gatewayRef: 'prov-refund-1',
    });
    expect(accepted.fake.calls).toEqual([
      { payment_id: 'prov-1', amount_cents: 900_000, currency: 'EGP', merchant_reference: 'r-1' },
    ]);
    await expect(
      provider({ id: 'p', state: 'voided' }, 'rejected').adapter.refund(request),
    ).resolves.toBe(false);
  });
});
