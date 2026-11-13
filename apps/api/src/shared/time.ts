/**
 * Time helpers. Instants are stored in UTC (timestamptz) and converted to an airport's IANA time
 * zone only here, so every module converts the same way (NFR-DATA-02).
 */

/** Injectable source of the current time, so tests can fix the clock. */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

export const systemClock: Clock = { now: () => new Date() };

const MINUTE_MS = 60_000;
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** True only for a real calendar date written as YYYY-MM-DD. */
export function isLocalDate(value: string): boolean {
  const match = LOCAL_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function localParts(instant: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
  };
}

/** The zone's offset from UTC at that instant, in minutes (Cairo in December: 120). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const local = localParts(instant, timeZone);
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const instantToMinute = Math.floor(instant.getTime() / MINUTE_MS) * MINUTE_MS;
  return Math.round((asUtc - instantToMinute) / MINUTE_MS);
}

function pad(value: number): string {
  return String(Math.abs(value)).padStart(2, '0');
}

/** An instant as local time with its UTC offset, e.g. 2026-12-10T09:00+02:00. */
export function formatLocal(instant: Date, timeZone: string): string {
  const local = localParts(instant, timeZone);
  const offset = offsetMinutes(instant, timeZone);
  const sign = offset < 0 ? '-' : '+';
  return (
    `${local.year}-${pad(local.month)}-${pad(local.day)}T${pad(local.hour)}:${pad(local.minute)}` +
    `${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`
  );
}

/**
 * The first instant of a local calendar day. When the zone skips midnight (a DST change at 00:00),
 * this is the instant the clocks jump to.
 */
function startOfLocalDay(year: number, month: number, day: number, timeZone: string): Date {
  const midnightAsUtc = Date.UTC(year, month - 1, day);
  const firstGuess = midnightAsUtc - offsetMinutes(new Date(midnightAsUtc), timeZone) * MINUTE_MS;
  const offsetThere = offsetMinutes(new Date(firstGuess), timeZone);
  return new Date(midnightAsUtc - offsetThere * MINUTE_MS);
}

/** The UTC range [start, end) covering one calendar day in the given zone. */
export function localDayToUtcRange(
  localDate: string,
  timeZone: string,
): { start: Date; end: Date } {
  if (!isLocalDate(localDate)) throw new RangeError(`Not a YYYY-MM-DD date: ${localDate}`);
  const [year, month, day] = localDate.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    start: startOfLocalDay(year, month, day, timeZone),
    end: startOfLocalDay(
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      next.getUTCDate(),
      timeZone,
    ),
  };
}

/** The calendar date (YYYY-MM-DD) an instant falls on in the given zone. */
export function localDateOf(instant: Date, timeZone: string): string {
  const local = localParts(instant, timeZone);
  return `${local.year}-${pad(local.month)}-${pad(local.day)}`;
}

/** Resolve a wall-clock time in an IANA zone. Repeated times use the first occurrence. */
export function localDepartureInstant(date: string, time: string, timeZone: string): Date | null {
  const wallTime = new Date(`${date}T${time}:00Z`).getTime();
  const offsets = new Set(
    [-24, 0, 24].map((hour) => offsetMinutes(new Date(wallTime + hour * 60 * MINUTE_MS), timeZone)),
  );
  const candidates = [...offsets]
    .map((offset) => new Date(wallTime - offset * MINUTE_MS))
    .filter((instant) => formatLocal(instant, timeZone).slice(0, 16) === `${date}T${time}`)
    .sort((a, b) => a.getTime() - b.getTime());
  return candidates[0] ?? null;
}
