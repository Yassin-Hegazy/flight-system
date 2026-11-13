import { describe, expect, it } from 'vitest';
import type { ChargeResult, PaymentGateway } from './gateway/payment-gateway';
import { PaymentEntity } from './payment.entity';
import type { PaymentsRepository } from './payments.repository';
import { RecoverPayments } from './recover-payments';
import type { RefundPayments } from './refund-payments';
import type { SettleCharge } from './settle-charge';
import { CAPTURED } from './test-support';

const NOW = new Date('2027-03-01T10:00:00Z');

/**
 * claimRecoveries hands each due payment to one run only, as the row lock with SKIP LOCKED and the
 * one-minute lease do in PostgreSQL.
 */
function fixture(answers: Record<string, ChargeResult | Error>) {
  const due = Object.keys(answers).map((id) => Object.assign(new PaymentEntity(), { id }));
  const log: string[] = [];
  const payments = {
    claimRecoveries: () => Promise.resolve(due.splice(0)),
    fail: (id: string, reason: string) => {
      log.push(`fail ${id} ${reason}`);
      return Promise.resolve();
    },
  };
  const gateway = {
    lookup: (key: string) => {
      const answer = answers[key];
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
  };
  const settle = {
    execute: (id: string) => {
      log.push(`settle ${id}`);
      return Promise.resolve();
    },
  };
  const refunds = {
    sendDue: (now: Date) => {
      log.push(`send due refunds at ${now.toISOString()}`);
      return Promise.resolve();
    },
  };
  const job = new RecoverPayments(
    gateway as unknown as PaymentGateway,
    payments as unknown as PaymentsRepository,
    settle as unknown as SettleCharge,
    refunds as unknown as RefundPayments,
  );
  return { job, log };
}

describe('US-PAY-06 RecoverPayments', () => {
  it('US-PAY-06-T04 two runs at once resolve each claimed payment once', async () => {
    const { job, log } = fixture({ 'pay-1': CAPTURED, 'pay-2': CAPTURED });

    await Promise.all([job.run(NOW), job.run(NOW)]);

    expect(log.filter((line) => line.startsWith('settle')).sort()).toEqual([
      'settle pay-1',
      'settle pay-2',
    ]);
  });

  it('US-PAY-06-T06 settles a capture, fails a decline, retries an error later, and always sends due refunds', async () => {
    const { job, log } = fixture({
      'pay-1': CAPTURED,
      'pay-2': { status: 'DECLINED', reason: 'no_charge' },
      'pay-3': new Error('provider down'),
      'pay-4': { status: 'UNAVAILABLE' },
    });

    await job.run(NOW);

    expect(log).toEqual([
      'settle pay-1',
      'fail pay-2 no_charge',
      'send due refunds at 2027-03-01T10:00:00.000Z',
    ]);
  });
});
