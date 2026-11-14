import type { Tx } from '../../shared/db';
import { BookingSegmentEntity } from './booking-segment.entity';

/**
 * A booking's segments in ascending flight-ID order. Inventory locks one cabin row per flight, so
 * every path that holds, commits or releases more than one leg takes them in this order: two
 * opposite round trips then queue behind each other instead of deadlocking (Inventory pack, 3.6).
 */
export function segmentsInLockOrder(tx: Tx, bookingId: string): Promise<BookingSegmentEntity[]> {
  return tx.find(BookingSegmentEntity, { where: { bookingId }, order: { flightId: 'ASC' } });
}

/** IDs of the bookings with any leg on this flight, outbound or return. */
export async function bookingIdsOnFlight(tx: Tx, flightId: string): Promise<string[]> {
  const segments = await tx.find(BookingSegmentEntity, {
    select: { bookingId: true },
    where: { flightId },
  });
  return [...new Set(segments.map(({ bookingId }) => bookingId))];
}
