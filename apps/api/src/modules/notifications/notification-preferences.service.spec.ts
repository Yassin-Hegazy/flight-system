import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryPreferencesRepository } from './in-memory-preferences.repository';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NOTIFICATION_TYPES } from './notification-templates';
import { ALICE, BOB } from './test-support';

let preferences: InMemoryPreferencesRepository;
let service: NotificationPreferencesService;

beforeEach(() => {
  preferences = new InMemoryPreferencesRepository();
  service = new NotificationPreferencesService(preferences);
});

describe('US-NT-07 email preferences', () => {
  it('US-NT-07-T03 every notification type is listed, with email off until the traveler opts in', async () => {
    const list = await service.preferences(ALICE);

    expect(list.map((p) => p.type)).toEqual([...NOTIFICATION_TYPES]);
    expect(list.every((p) => p.email === false)).toBe(true);
  });

  it('US-NT-07-T03 opting in changes only that type, for only that traveler', async () => {
    expect(await service.setEmailPreference(ALICE, 'FlightDelayed', true)).toEqual({
      ok: true,
      value: undefined,
    });

    const alices = await service.preferences(ALICE);
    expect(alices.filter((p) => p.email).map((p) => p.type)).toEqual(['FlightDelayed']);
    expect((await service.preferences(BOB)).some((p) => p.email)).toBe(false);
  });

  it('US-NT-07-T03 opting out again turns it back off', async () => {
    await service.setEmailPreference(ALICE, 'FlightDelayed', true);
    await service.setEmailPreference(ALICE, 'FlightDelayed', false);

    expect((await service.preferences(ALICE)).some((p) => p.email)).toBe(false);
  });

  it('US-NT-07-T03 a type that does not exist is refused, and nothing is stored', async () => {
    expect(await service.setEmailPreference(ALICE, 'Nonsense', true)).toEqual({
      ok: false,
      error: 'UNKNOWN_TYPE',
    });
    expect(await preferences.list(ALICE)).toEqual([]);
  });
});
