/**
 * Flight operational status as a state machine (overview, section 4.2). The transition table is the
 * one place that answers "can a flight move from X to Y?".
 */
export enum FlightStatus {
  Scheduled = 'SCHEDULED',
  Delayed = 'DELAYED',
  Boarding = 'BOARDING',
  Departed = 'DEPARTED',
  Arrived = 'ARRIVED',
  Cancelled = 'CANCELLED',
}

const TRANSITIONS: Record<FlightStatus, readonly FlightStatus[]> = {
  [FlightStatus.Scheduled]: [FlightStatus.Delayed, FlightStatus.Boarding, FlightStatus.Cancelled],
  // A delay can be extended with a new estimated time.
  [FlightStatus.Delayed]: [FlightStatus.Delayed, FlightStatus.Boarding, FlightStatus.Cancelled],
  [FlightStatus.Boarding]: [FlightStatus.Departed, FlightStatus.Cancelled],
  [FlightStatus.Departed]: [FlightStatus.Arrived],
  [FlightStatus.Arrived]: [],
  [FlightStatus.Cancelled]: [],
};

export class InvalidFlightStatus extends Error {
  constructor(value: string) {
    super(`Invalid flight status: ${value}`);
    this.name = 'InvalidFlightStatus';
  }
}

const ALL_STATUSES: readonly string[] = Object.values(FlightStatus);

/** A status can only be built from one of the six known values (US-FL-02 AC-2). */
export function parseFlightStatus(raw: string): FlightStatus {
  const value = raw.trim().toUpperCase();
  if (!ALL_STATUSES.includes(value)) throw new InvalidFlightStatus(raw);
  return value as FlightStatus;
}

export function canTransition(from: FlightStatus, to: FlightStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
