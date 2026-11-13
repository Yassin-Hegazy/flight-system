import type { Tx } from '../../shared/db';
import type { BookingConfirmed } from '../../shared/events';
import type { Money } from '../../shared/money';
import type { Result } from '../../shared/result';

export type PayableError = 'NOT_FOUND' | 'ALREADY_PAID' | 'HOLD_EXPIRED';

export interface PayableBooking {
  bookingId: string;
  amount: Money;
}

export interface BookingPayments {
  getPayable(reference: string, payerId: string): Promise<Result<PayableBooking, PayableError>>;
  confirmPaid(
    tx: Tx,
    bookingId: string,
    paymentId: string,
  ): Promise<Result<BookingConfirmed, 'HOLD_EXPIRED'>>;
}

export const BOOKING_PAYMENTS = Symbol('BOOKING_PAYMENTS');
