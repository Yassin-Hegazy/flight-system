import { describe, expect, it } from 'vitest';
import type { ChargeRequest, ChargeResult, PaymentGateway } from './gateway/payment-gateway';
import { CAPTURED, payFixture, ScriptedGateway, TOTAL } from './test-support';

/** A second, unrelated adapter: same Target, different internals. */
class SecondAdapter implements PaymentGateway {
  readonly keys: string[] = [];

  charge({ idempotencyKey }: ChargeRequest): Promise<ChargeResult> {
    this.keys.push(idempotencyKey);
    return Promise.resolve({ ...CAPTURED, gatewayRef: `second-${idempotencyKey}` });
  }

  lookup(): Promise<ChargeResult> {
    return Promise.resolve({ status: 'UNAVAILABLE' });
  }

  refund() {
    return Promise.resolve(false as const);
  }
}

describe('US-PAY-01 PayForBooking', () => {
  it('US-PAY-01-T05 runs unchanged against a second adapter', async () => {
    const adapter = new SecondAdapter();
    const { request } = payFixture(adapter);

    const result = await request('key-1');

    expect(result).toMatchObject({ ok: true, value: { status: 'SUCCEEDED', amount: TOTAL } });
    expect(adapter.keys).toHaveLength(1);
  });

  it('US-PAY-01-T11 each refusal from Booking is returned and nothing is charged', async () => {
    for (const code of ['NOT_FOUND', 'ALREADY_PAID', 'HOLD_EXPIRED'] as const) {
      const gateway = new ScriptedGateway();
      const { booking, payments, request } = payFixture(gateway);
      booking.refuse(code);

      await expect(request('key-1')).resolves.toEqual({ ok: false, error: { code } });
      expect(gateway.charges).toHaveLength(0);
      expect(payments.rows).toHaveLength(0);
    }
  });

  it("US-PAY-01-T12 charges Booking's snapshot amount, keyed by the attempt's own ID", async () => {
    const gateway = new ScriptedGateway();
    const { payments, request } = payFixture(gateway);

    await request('key-1');

    expect(gateway.charges).toEqual([
      { token: 'tok_success', amount: TOTAL, idempotencyKey: payments.rows[0].id },
    ]);
    expect(payments.rows[0]).toMatchObject({ amountMinor: 900_000, currency: 'EGP' });
  });
});

describe('US-PAY-02 PayForBooking after a decline', () => {
  const declined = { status: 'DECLINED', reason: 'insufficient_funds' } as const;

  it('US-PAY-02-T02 records every attempt: the decline as FAILED with its reason, the retry as new', async () => {
    const { payments, request } = payFixture(new ScriptedGateway(declined));

    await expect(request('key-1')).resolves.toEqual({
      ok: false,
      error: { code: 'DECLINED', reason: 'insufficient_funds' },
    });
    await request('key-2', 'tok_declined');

    expect(payments.rows.map(({ status, declineReason }) => [status, declineReason])).toEqual([
      ['FAILED', 'insufficient_funds'],
      ['FAILED', 'insufficient_funds'],
    ]);
  });

  it('US-PAY-02-T03 a decline never reaches Booking, so the hold keeps its expiry', async () => {
    const { booking, settled, request } = payFixture(new ScriptedGateway(declined));

    await request('key-1');

    expect(booking.calls).toEqual([]);
    expect(settled).toEqual([]);
  });
});

describe('US-PAY-03 PayForBooking never charges twice', () => {
  it('US-PAY-03-T03 while another attempt for the booking is live, nothing is charged', async () => {
    const gateway = new ScriptedGateway({ status: 'UNAVAILABLE' });
    const { request } = payFixture(gateway);
    await request('key-1');

    await expect(request('key-2')).resolves.toEqual({ ok: false, error: { code: 'IN_PROGRESS' } });
    expect(gateway.charges).toHaveLength(1);
  });

  it('US-PAY-03-T04 a second key on a paid booking is ALREADY_PAID and charges nothing', async () => {
    const gateway = new ScriptedGateway();
    const { request } = payFixture(gateway);
    await request('key-1');

    await expect(request('key-2')).resolves.toEqual({ ok: false, error: { code: 'ALREADY_PAID' } });
    expect(gateway.charges).toHaveLength(1);
  });

  it('US-PAY-03-T05 the same key replays the stored result and charges once', async () => {
    const gateway = new ScriptedGateway();
    const { request } = payFixture(gateway);

    const first = await request('key-1');
    const second = await request('key-1');

    expect(second).toEqual(first);
    expect(gateway.charges).toHaveLength(1);
  });

  it('US-PAY-03-T06 the same key with a different card token is KEY_REUSED', async () => {
    const gateway = new ScriptedGateway();
    const { request } = payFixture(gateway);
    await request('key-1');

    await expect(request('key-1', 'tok_declined')).resolves.toEqual({
      ok: false,
      error: { code: 'KEY_REUSED' },
    });
    expect(gateway.charges).toHaveLength(1);
  });
});

describe('US-PAY-06 PayForBooking when the provider does not answer', () => {
  it('US-PAY-06-T05 an unavailable or failing gateway leaves the attempt PENDING for recovery', async () => {
    for (const answer of [{ status: 'UNAVAILABLE' } as const, new Error('socket hang up')]) {
      const { payments, settled, request } = payFixture(new ScriptedGateway(answer));

      await expect(request('key-1')).resolves.toMatchObject({
        ok: true,
        value: { status: 'PENDING' },
      });
      expect(payments.rows[0].status).toBe('PENDING');
      expect(settled).toEqual([]);
    }
  });
});
