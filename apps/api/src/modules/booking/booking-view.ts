import type { Tx } from '../../shared/db';
import { type Money, money } from '../../shared/money';
import { BookingHistoryEntity } from './booking-history.entity';
import { BookingPassengerEntity } from './booking-passenger.entity';
import { BookingEntity } from './booking.entity';
import type { BookingStatus } from './booking-state';
import type { PassengerKind } from './passenger-rules';

export interface PassengerView {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  type: PassengerKind;
  fare: Money;
}

export interface HistoryView {
  from: BookingStatus | null;
  to: BookingStatus;
  cause: string;
  at: string;
}

/** Everything the owner needs to understand a trip in one view (US-BK-04 AC-1). */
export interface BookingView {
  reference: string;
  flightId: string;
  cabin: BookingEntity['cabin'];
  status: BookingStatus;
  /** The total fare snapshot. */
  amount: Money;
  /** The hold expiry, present only while the booking is pending payment. */
  expiresAt: string | null;
  cancelReason: BookingEntity['cancelReason'];
  passengers: PassengerView[];
  history: HistoryView[];
}

/** Pure mapping from stored rows to the view, so it can be unit-tested per state. */
export function toView(
  booking: BookingEntity,
  passengers: readonly BookingPassengerEntity[],
  history: readonly BookingHistoryEntity[],
): BookingView {
  return {
    reference: booking.reference,
    flightId: booking.flightId,
    cabin: booking.cabin,
    status: booking.status,
    amount: money(booking.amountMinor, booking.currency),
    expiresAt:
      booking.status === 'PENDING_PAYMENT' && booking.expiresAt
        ? booking.expiresAt.toISOString()
        : null,
    cancelReason: booking.cancelReason,
    passengers: [...passengers]
      .sort((a, b) => a.position - b.position)
      .map((p) => ({
        firstName: p.firstName,
        lastName: p.lastName,
        birthDate: p.birthDate,
        type: p.type,
        fare: money(p.fareMinor, p.currency),
      })),
    history: [...history]
      .sort((a, b) => a.id - b.id)
      .map((h) => ({
        from: h.fromStatus,
        to: h.toStatus,
        cause: h.cause,
        at: h.at.toISOString(),
      })),
  };
}

/** Loads a booking's passengers and history and maps them. */
export async function loadView(manager: Tx, booking: BookingEntity): Promise<BookingView> {
  const [passengers, history] = await Promise.all([
    manager.findBy(BookingPassengerEntity, { bookingId: booking.id }),
    manager.findBy(BookingHistoryEntity, { bookingId: booking.id }),
  ]);
  return toView(booking, passengers, history);
}
