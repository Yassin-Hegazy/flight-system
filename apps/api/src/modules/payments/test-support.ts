import { money, type Money } from '../../shared/money';
import { err, ok } from '../../shared/result';
import type { BookingPayments } from '../booking/index';
import type {
  ChargeRequest,
  ChargeResult,
  DeclineReason,
  PaymentGateway,
  SuccessfulCharge,
} from './gateway/payment-gateway';
import { PayForBooking } from './pay-for-booking';
import { PaymentEntity } from './payment.entity';
import type { PaymentsRepository } from './payments.repository';
import type { SettleCharge } from './settle-charge';

type Payable = Awaited<ReturnType<BookingPayments['getPayable']>>;
type PayableError = Extract<Payable, { ok: false }>['error'];

export const PAYER = '11111111-1111-4111-8111-111111111111';
export const BOOKING_ID = '22222222-2222-4222-8222-222222222222';
export const REFERENCE = 'K7M2QP';
export const TOTAL: Money = money(900_000, 'EGP');
export const CAPTURED: SuccessfulCharge = {
  status: 'SUCCEEDED',
  gatewayRef: 'ref-1',
  brand: 'VISA',
  last4: '4242',
};

/** A gateway double that answers from a script and counts the charges it receives. */
export class ScriptedGateway implements PaymentGateway {
  readonly charges: ChargeRequest[] = [];

  constructor(private readonly answer: ChargeResult | Error = CAPTURED) {}

  charge(request: ChargeRequest): Promise<ChargeResult> {
    this.charges.push(request);
    return this.answer instanceof Error
      ? Promise.reject(this.answer)
      : Promise.resolve(this.answer);
  }

  lookup(): Promise<ChargeResult> {
    return this.answer instanceof Error
      ? Promise.reject(this.answer)
      : Promise.resolve(this.answer);
  }

  refund(): Promise<{ gatewayRef: string } | false> {
    return Promise.resolve({ gatewayRef: 'refund-1' });
  }
}

/**
 * The payments table in memory. start() refuses a second live attempt for a booking and a reused
 * key, as one_live_payment_per_booking and payments_payer_key_unique do in PostgreSQL.
 */
export class InMemoryPayments {
  readonly rows: PaymentEntity[] = [];

  findByKey(payerId: string, idempotencyKey: string) {
    return Promise.resolve(
      this.rows.find((row) => row.payerId === payerId && row.idempotencyKey === idempotencyKey) ??
        null,
    );
  }

  findLive(bookingId: string, payerId: string) {
    return Promise.resolve(
      this.rows.find(
        (row) => row.bookingId === bookingId && row.payerId === payerId && row.status !== 'FAILED',
      ) ?? null,
    );
  }

  start(attempt: Partial<PaymentEntity>) {
    const clash = this.rows.some(
      (row) =>
        (row.bookingId === attempt.bookingId && row.status !== 'FAILED') ||
        (row.payerId === attempt.payerId && row.idempotencyKey === attempt.idempotencyKey),
    );
    if (clash) return Promise.resolve(null);
    const row = Object.assign(new PaymentEntity(), {
      id: `pay-${this.rows.length + 1}`,
      status: 'PENDING',
      failureCode: null,
      declineReason: null,
      cardBrand: null,
      cardLast4: null,
      ...attempt,
    });
    this.rows.push(row);
    return Promise.resolve(row);
  }

  findById(id: string) {
    const row = this.rows.find((candidate) => candidate.id === id);
    return row ? Promise.resolve(row) : Promise.reject(new Error(`No payment ${id}`));
  }

  fail(id: string, declineReason: DeclineReason) {
    const row = this.rows.find(
      (candidate) => candidate.id === id && candidate.status === 'PENDING',
    );
    if (row) Object.assign(row, { status: 'FAILED', failureCode: 'DECLINED', declineReason });
    return Promise.resolve();
  }

  /** What SettleCharge would leave behind after a successful confirmation. */
  settled(id: string, charge: SuccessfulCharge) {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (row) {
      Object.assign(row, {
        status: 'SUCCEEDED',
        gatewayRef: charge.gatewayRef,
        cardBrand: charge.brand,
        cardLast4: charge.last4,
      });
    }
  }
}

/** Booking's side of paying: answers getPayable and records every other call. */
export class FakeBooking implements BookingPayments {
  readonly calls: string[] = [];

  constructor(
    private payable: Payable = ok({
      bookingId: BOOKING_ID,
      amount: TOTAL,
    }),
  ) {}

  refuse(error: PayableError) {
    this.payable = err(error);
  }

  ownedId(): Promise<string | null> {
    this.calls.push('ownedId');
    return Promise.resolve(BOOKING_ID);
  }

  getPayable() {
    return Promise.resolve(this.payable);
  }

  confirmPaid(): ReturnType<BookingPayments['confirmPaid']> {
    this.calls.push('confirmPaid');
    return Promise.reject(new Error('PayForBooking confirms only through SettleCharge'));
  }
}

/** PayForBooking wired to in-memory doubles. */
export function payFixture(gateway: PaymentGateway = new ScriptedGateway()) {
  const payments = new InMemoryPayments();
  const booking = new FakeBooking();
  const settled: string[] = [];
  const settle = {
    execute: (id: string, charge: SuccessfulCharge) => {
      settled.push(id);
      payments.settled(id, charge);
      return Promise.resolve();
    },
  };
  const pay = new PayForBooking(
    payments as unknown as PaymentsRepository,
    booking,
    gateway,
    settle as unknown as SettleCharge,
  );
  const request = (idempotencyKey: string, token = 'tok_success') =>
    pay.execute({ reference: REFERENCE, payerId: PAYER, token, idempotencyKey });
  return { pay, payments, booking, settled, request };
}
