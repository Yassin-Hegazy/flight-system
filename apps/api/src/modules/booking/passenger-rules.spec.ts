import { describe, expect, it } from 'vitest';
import {
  ageOn,
  countParty,
  kindForAge,
  MAX_PASSENGERS,
  type PassengerInput,
  seatsNeeded,
  validatePassengers,
} from './passenger-rules';

const TODAY = '2027-01-10';
const DEPARTURE = '2027-02-01';
const adult = (overrides: Partial<PassengerInput> = {}): PassengerInput => ({
  firstName: 'Sara',
  lastName: 'Hassan',
  birthDate: '1990-05-01',
  type: 'ADULT',
  ...overrides,
});
const check = (passengers: PassengerInput[]) => validatePassengers(passengers, DEPARTURE, TODAY);

describe('Passenger validation (US-BK-01 AC-1)', () => {
  it('US-BK-01-T01 accepts a valid passenger', () => {
    expect(check([adult()])).toEqual({});
  });

  it.each([
    [0, false],
    [1, true],
    [50, true],
    [51, false],
  ])('US-BK-01-T01 a first name of %i characters: valid=%s', (length, valid) => {
    const errors = check([adult({ firstName: 'a'.repeat(length) })]);
    expect('passengers.0.firstName' in errors).toBe(!valid);
  });

  it.each(["O'Neil", 'Abdel-Rahman', 'Mary Ann', 'D’Arcy', 'Müller'])(
    'US-BK-01-T01 accepts the real name %s',
    (lastName) => {
      expect(check([adult({ lastName })])).toEqual({});
    },
  );

  it.each(['Sara1', 'Sara_', 'Sara!', '<b>', ''])(
    'US-BK-01-T01 rejects the name %j',
    (firstName) => {
      expect(check([adult({ firstName })])).toHaveProperty('passengers.0.firstName');
    },
  );

  it('US-BK-01-T01 a birth date tomorrow is rejected, today is accepted', () => {
    expect(check([adult({ birthDate: '2027-01-11', type: 'INFANT' })])).toEqual({
      'passengers.0.birthDate': 'BIRTH_DATE_IN_FUTURE',
    });
    expect(check([adult({ birthDate: TODAY, type: 'INFANT' })])).toEqual({});
  });

  it.each(['1990-13-01', '1990-02-30', 'yesterday', '01/05/1990'])(
    'US-BK-01-T01 rejects the non-date %j',
    (birthDate) => {
      expect(check([adult({ birthDate })])).toHaveProperty('passengers.0.birthDate');
    },
  );

  it('US-BK-01-T01 11 versus 12 years on the departure date decides child versus adult', () => {
    // Turns 12 on 2027-02-01, the departure date: an adult.
    expect(check([adult({ birthDate: '2015-02-01', type: 'ADULT' })])).toEqual({});
    expect(check([adult({ birthDate: '2015-02-01', type: 'CHILD' })])).toHaveProperty(
      'passengers.0.type',
    );
    // Turns 12 the day after departure: still 11, so a child.
    expect(check([adult({ birthDate: '2015-02-02', type: 'CHILD' })])).toEqual({});
    expect(check([adult({ birthDate: '2015-02-02', type: 'ADULT' })])).toHaveProperty(
      'passengers.0.type',
    );
  });

  it('US-BK-01-T01 age is judged on the departure date, not on today', () => {
    // 11 today, but 12 on the flight.
    expect(ageOn('2015-01-20', TODAY)).toBe(11);
    expect(check([adult({ birthDate: '2015-01-20', type: 'ADULT' })])).toEqual({});
  });

  it.each([
    [0, 'INFANT'],
    [1, 'INFANT'],
    [2, 'CHILD'],
    [11, 'CHILD'],
    [12, 'ADULT'],
    [80, 'ADULT'],
  ])('US-BK-01-T01 age %i is %s', (age, kind) => {
    expect(kindForAge(age)).toBe(kind);
  });

  it('US-BK-01-T01 reports the index of the invalid passenger', () => {
    expect(check([adult(), adult({ lastName: '' })])).toHaveProperty('passengers.1.lastName');
  });
});

describe('Party size (US-BK-01 AC-5)', () => {
  it('US-BK-01-T05 9 passengers are accepted and 10 are rejected', () => {
    const party = (n: number) => Array.from({ length: n }, () => adult());
    expect(check(party(MAX_PASSENGERS))).toEqual({});
    expect(check(party(MAX_PASSENGERS + 1))).toHaveProperty('passengers');
    expect(check([])).toHaveProperty('passengers');
  });

  it('US-BK-01-T05 counts the party and seats only adults and children', () => {
    const party = countParty([
      { type: 'ADULT' },
      { type: 'ADULT' },
      { type: 'CHILD' },
      { type: 'INFANT' },
    ]);
    expect(party).toEqual({ adults: 2, children: 1, infants: 1 });
    expect(seatsNeeded(party)).toBe(3);
  });
});
