/**
 * The State pattern for a booking's lifecycle (Booking pack, sections 3.1 and 7).
 *
 * Each status is an object that knows its own legal moves. The base class rejects every move, and
 * each state overrides only the moves it allows, so an illegal transition needs no code of its
 * own. The classes are pure (no database, no clock of their own), which keeps them unit-testable.
 */

export const BOOKING_STATUSES = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'TICKETED',
  'EXPIRED',
  'CANCELLED',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Who is asking for a cancellation. The airline is not bound by the traveler's cut-off. */
export type Actor = { kind: 'TRAVELER'; userId: string } | { kind: 'AIRLINE' };

/** What a state needs to decide whether a cancellation is allowed. */
export interface CancelContext {
  by: Actor;
  now: Date;
  /** The departure instant, or null when the caller does not know it (airline cancellations). */
  departureUtc: Date | null;
}

export const CANCELLATION_WINDOW_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;

export class InvalidBookingTransition extends Error {
  constructor(
    readonly from: BookingStatus,
    readonly to: BookingStatus,
  ) {
    super(`A ${from} booking cannot become ${to}`);
    this.name = 'InvalidBookingTransition';
  }
}

export class CancellationWindowClosed extends Error {
  constructor() {
    super(`Traveler cancellations close ${CANCELLATION_WINDOW_HOURS} hours before departure`);
    this.name = 'CancellationWindowClosed';
  }
}

/** Whole and fractional hours from `now` to departure; negative once the flight has left. */
export function hoursToDeparture(ctx: CancelContext): number {
  if (!ctx.departureUtc) return Number.NEGATIVE_INFINITY;
  return (ctx.departureUtc.getTime() - ctx.now.getTime()) / HOUR_MS;
}

/** Exactly 24 h 00 min is still allowed; 23 h 59 min is not. */
function assertTravelerMayCancel(ctx: CancelContext): void {
  if (ctx.by.kind === 'TRAVELER' && hoursToDeparture(ctx) < CANCELLATION_WINDOW_HOURS) {
    throw new CancellationWindowClosed();
  }
}

export abstract class BookingState {
  abstract readonly name: BookingStatus;

  confirm(): BookingState {
    throw new InvalidBookingTransition(this.name, 'CONFIRMED');
  }

  markTicketed(): BookingState {
    throw new InvalidBookingTransition(this.name, 'TICKETED');
  }

  expire(): BookingState {
    throw new InvalidBookingTransition(this.name, 'EXPIRED');
  }

  cancel(ctx: CancelContext): BookingState {
    void ctx; // the base state rejects the move whoever asks and whenever
    throw new InvalidBookingTransition(this.name, 'CANCELLED');
  }
}

class PendingPayment extends BookingState {
  readonly name = 'PENDING_PAYMENT';

  override confirm(): BookingState {
    return CONFIRMED;
  }

  override expire(): BookingState {
    return EXPIRED;
  }

  /** Always allowed while unpaid: there is nothing to refund. */
  override cancel(): BookingState {
    return CANCELLED;
  }
}

class Confirmed extends BookingState {
  readonly name = 'CONFIRMED';

  override markTicketed(): BookingState {
    return TICKETED;
  }

  override cancel(ctx: CancelContext): BookingState {
    assertTravelerMayCancel(ctx);
    return CANCELLED;
  }
}

class Ticketed extends BookingState {
  readonly name = 'TICKETED';

  override cancel(ctx: CancelContext): BookingState {
    assertTravelerMayCancel(ctx);
    return CANCELLED;
  }
}

/** Terminal: nothing is overridden, so every move is rejected. */
class Expired extends BookingState {
  readonly name = 'EXPIRED';
}

class Cancelled extends BookingState {
  readonly name = 'CANCELLED';

  /** A repeated cancel is a harmless no-op (US-BK-05 AC-3): the same state comes back. */
  override cancel(): BookingState {
    return this;
  }
}

const PENDING_PAYMENT = new PendingPayment();
const CONFIRMED = new Confirmed();
const TICKETED = new Ticketed();
const EXPIRED = new Expired();
const CANCELLED = new Cancelled();

const STATES: Record<BookingStatus, BookingState> = {
  PENDING_PAYMENT,
  CONFIRMED,
  TICKETED,
  EXPIRED,
  CANCELLED,
};

/** The state object for a stored status. */
export function stateFor(status: BookingStatus): BookingState {
  return STATES[status];
}

/** Statuses from which a booking can still end (everything except the two terminal ones). */
export const NON_TERMINAL_STATUSES: readonly BookingStatus[] = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'TICKETED',
];
