import { Suspense } from 'react';
import { FlightOps } from './flight-ops';

export default function AdminFlightPage() {
  return (
    <Suspense fallback={<p role="status">Loading the flight…</p>}>
      <FlightOps />
    </Suspense>
  );
}
