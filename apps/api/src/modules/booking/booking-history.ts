import type { Tx } from '../../shared/db';
import { BookingHistoryEntity, type TransitionCause } from './booking-history.entity';
import type { BookingStatus } from './booking-state';

/** Records one transition inside the caller's transaction, so history never disagrees with status. */
export async function recordTransition(
  tx: Tx,
  bookingId: string,
  from: BookingStatus | null,
  to: BookingStatus,
  cause: TransitionCause,
): Promise<void> {
  await tx.insert(BookingHistoryEntity, { bookingId, fromStatus: from, toStatus: to, cause });
}
