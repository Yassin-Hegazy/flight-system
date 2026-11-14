import type { FieldErrors } from '../../shared/errors';
import { isLocalDate } from '../../shared/time';

/** US-BK-01 AC-1 and AC-5: what a valid passenger looks like, as pure functions. */

export type PassengerKind = 'ADULT' | 'CHILD' | 'INFANT';

export interface PassengerInput {
  firstName: string;
  lastName: string;
  /** YYYY-MM-DD. */
  birthDate: string;
  type: PassengerKind;
}

export const MAX_PASSENGERS = 9;

// 1-50 letters, spaces, hyphens or apostrophes: O'Neil and Abdel-Rahman are real names.
const NAME = /^[\p{L} '’-]{1,50}$/u;

/** Whole years completed on `onDate` by someone born on `birthDate` (both YYYY-MM-DD). */
export function ageOn(birthDate: string, onDate: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [oy, om, od] = onDate.split('-').map(Number);
  let age = oy - by;
  if (om < bm || (om === bm && od < bd)) age -= 1;
  return age;
}

/** Infants are under 2, children 2 to 11, adults 12 and over, judged on the departure date. */
export function kindForAge(age: number): PassengerKind {
  if (age < 2) return 'INFANT';
  if (age < 12) return 'CHILD';
  return 'ADULT';
}

/**
 * Field errors keyed like `passengers.0.birthDate`; empty when every passenger is valid.
 * `departureDate` is the local departure date, `today` the current UTC date, both YYYY-MM-DD.
 * A child can turn 12 between booking and flying, which is why age is judged on departure.
 */
export function validatePassengers(
  passengers: readonly PassengerInput[],
  departureDate: string,
  today: string,
): FieldErrors {
  const errors: FieldErrors = {};
  if (passengers.length < 1) errors.passengers = 'At least one passenger is required.';
  if (passengers.length > MAX_PASSENGERS) {
    errors.passengers = `A booking can have at most ${MAX_PASSENGERS} passengers.`;
  }
  passengers.forEach((passenger, index) => {
    const at = (field: string) => `passengers.${index}.${field}`;
    for (const field of ['firstName', 'lastName'] as const) {
      if (!NAME.test(passenger[field])) {
        errors[at(field)] = 'Use 1 to 50 letters, spaces, hyphens or apostrophes.';
      }
    }
    if (!isLocalDate(passenger.birthDate)) {
      errors[at('birthDate')] = 'Use a real date written as YYYY-MM-DD.';
    } else if (passenger.birthDate > today) {
      errors[at('birthDate')] = 'BIRTH_DATE_IN_FUTURE';
    } else if (kindForAge(ageOn(passenger.birthDate, departureDate)) !== passenger.type) {
      errors[at('type')] = 'The passenger type does not match their age on the departure date.';
    }
  });
  return errors;
}

export interface PartyCounts {
  adults: number;
  children: number;
  infants: number;
}

export function countParty(passengers: readonly { type: PassengerKind }[]): PartyCounts {
  const count = (type: PassengerKind) => passengers.filter((p) => p.type === type).length;
  return { adults: count('ADULT'), children: count('CHILD'), infants: count('INFANT') };
}

/** Adults and children need seats; infants sit on a lap (Catalog's PassengerMix rule). */
export function seatsNeeded(party: PartyCounts): number {
  return party.adults + party.children;
}
