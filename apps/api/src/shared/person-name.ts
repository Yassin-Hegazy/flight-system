/**
 * One person-name rule for every module that stores a traveler's name: a booking passenger's
 * first or last name is 1 to 50 letters, spaces, hyphens or apostrophes (O'Neil and Abdel-Rahman
 * are real names; digits and markup are not).
 */
export const NAME_PART = /^[\p{L} '’-]{1,50}$/u;

/**
 * A full name split the way a passenger form fills from it: the first word is the first name, the
 * rest the last name. Null when either part would fail NAME_PART, so a saved traveler can never
 * hold a name a booking would refuse (US-USR-06 AC-2).
 */
export function splitFullName(fullName: string): { firstName: string; lastName: string } | null {
  const trimmed = fullName.trim().replace(/\s+/g, ' ');
  const space = trimmed.indexOf(' ');
  if (space < 0) return null;
  const firstName = trimmed.slice(0, space);
  const lastName = trimmed.slice(space + 1);
  return NAME_PART.test(firstName) && NAME_PART.test(lastName) ? { firstName, lastName } : null;
}
