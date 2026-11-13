import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';
import type { BookingConfirmed } from '../../shared/events';
import { err, ok } from '../../shared/result';
import type { BookingPayments } from '../booking/index';
import { PaymentEntity } from './payment.entity';
import type { PaymentsRepository } from './payments.repository';
import type { RefundPayments } from './refund-payments';
import { SettleCharge } from './settle-charge';
import { BOOKING_ID, CAPTURED, PAYER } from './test-support';

const TX = { tx: true };
const CONFIRMED: BookingConfirmed = {
  type: 'BookingConfirmed',
  eventId: 'e-1',
  bookingId: BOOKING_ID,
  ownerId: PAYER,
  ref: 'K7M2QP',
};

/** Every collaborator writes to one log, so the test can read the order of events. */
function fixture(
  options: {
    status?: PaymentEntity['status'];
    holdExpired?: boolean;
    observerFails?: boolean;
  } = {},
) {
  const log: string[] = [];
  const payment = Object.assign(new PaymentEntity(), {
    id: 'pay-1',
    bookingId: BOOKING_ID,
    status: options.status ?? 'PENDING',
  });
  const db = {
    transaction: async (_level: string, work: (tx: unknown) => Promise<unknown>) => {
      log.push('begin');
      const result = await work(TX);
      log.push('commit');
      return result;
    },
  };
  const booking = {
    confirmPaid: (tx: unknown) => {
      log.push(tx === TX ? 'confirm in tx' : 'confirm outside tx');
      return Promise.resolve(options.holdExpired ? err('HOLD_EXPIRED' as const) : ok(CONFIRMED));
    },
  };
  const payments = {
    lock: () => Promise.resolve(payment),
    succeed: (tx: unknown, _id: string, _card: unknown, failure: string | null) => {
      log.push(`succeed ${failure ?? 'confirmed'}${tx === TX ? ' in tx' : ''}`);
      return Promise.resolve();
    },
  };
  const refunds = {
    record: (tx: unknown) => {
      log.push(tx === TX ? 'record refund in tx' : 'record refund outside tx');
      return Promise.resolve();
    },
    sendForPayment: () => {
      log.push('send refund');
      return Promise.resolve();
    },
  };
  const events = {
    emitAsync: (type: string) => {
      log.push(`publish ${type}`);
      return options.observerFails ? Promise.reject(new Error('observer')) : Promise.resolve([]);
    },
  };
  const settle = new SettleCharge(
    db as unknown as DataSource,
    booking as unknown as BookingPayments,
    payments as unknown as PaymentsRepository,
    refunds as unknown as RefundPayments,
    events as unknown as EventEmitter2,
  );
  return { settle, log };
}

describe('US-PAY-01 SettleCharge', () => {
  it('US-PAY-01-T13 marks the payment and confirms the booking in one transaction, then publishes', async () => {
    const { settle, log } = fixture();

    await settle.execute('pay-1', CAPTURED);

    expect(log).toEqual([
      'begin',
      'confirm in tx',
      'succeed confirmed in tx',
      'commit',
      'publish BookingConfirmed',
    ]);
  });

  it('US-PAY-01-T14 a hold that expired during the charge records a refund in the transaction and sends it after', async () => {
    const { settle, log } = fixture({ holdExpired: true });

    await settle.execute('pay-1', CAPTURED);

    expect(log).toEqual([
      'begin',
      'confirm in tx',
      'succeed HOLD_EXPIRED in tx',
      'record refund in tx',
      'commit',
      'send refund',
    ]);
  });

  it('US-PAY-01-T15 a payment that is no longer pending is left alone', async () => {
    const { settle, log } = fixture({ status: 'SUCCEEDED' });

    await settle.execute('pay-1', CAPTURED);

    expect(log).toEqual(['begin', 'commit']);
  });

  it('US-PAY-01-T16 a failing observer does not undo or fail a committed confirmation', async () => {
    const { settle, log } = fixture({ observerFails: true });

    await expect(settle.execute('pay-1', CAPTURED)).resolves.toBeUndefined();
    expect(log.slice(-2)).toEqual(['commit', 'publish BookingConfirmed']);
  });
});
