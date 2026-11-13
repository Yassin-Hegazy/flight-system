import { describe, expect, it } from 'vitest';
import { DeleteAirport, UpsertAirport } from './airport.commands';
import { asAdmin, FakeCatalog, fakeBus } from './test-support';

const CAIRO = {
  code: 'CAI',
  name: 'Cairo',
  city: 'Cairo',
  country: 'Egypt',
  timezone: 'Africa/Cairo',
};

describe('US-AD-06 Manage airports (commands)', () => {
  it('US-AD-06-T06 audits an airport as it was before and after: null before a new one', async () => {
    const catalog = new FakeCatalog();
    const { bus, audits } = fakeBus();
    const edited = { ...CAIRO, name: 'Cairo International' };
    const added = {
      code: 'HBE',
      name: 'Borg El Arab',
      city: 'Alexandria',
      country: 'Egypt',
      timezone: 'Africa/Cairo',
    };

    await bus.dispatch(new UpsertAirport(catalog.api, edited), asAdmin());
    await bus.dispatch(new UpsertAirport(catalog.api, added), asAdmin());

    expect(audits.map(({ changes }) => changes)).toEqual([
      [{ target: 'CAI', before: CAIRO, after: edited }],
      [{ target: 'HBE', before: null, after: added }],
    ]);
  });

  it('US-AD-06-T07 an airport in use is not deleted, and the refusal is not audited', async () => {
    const catalog = new FakeCatalog();
    catalog.deleteError = 'AIRPORT_IN_USE';
    const { bus, log, audits } = fakeBus();

    const result = await bus.dispatch(new DeleteAirport(catalog.api, 'CAI'), asAdmin());

    expect(result).toEqual({ ok: false, error: 'AIRPORT_IN_USE' });
    expect(await catalog.airport('CAI')).toEqual(CAIRO);
    expect(log).toEqual(['begin', 'rollback']);
    expect(audits).toEqual([]);
  });

  it('US-AD-06-T08 a deleted airport is audited with its last details and null after', async () => {
    const catalog = new FakeCatalog();
    const { bus, audits } = fakeBus();

    const result = await bus.dispatch(new DeleteAirport(catalog.api, 'CAI'), asAdmin());

    expect(result).toEqual({ ok: true, value: { code: 'CAI' } });
    expect(audits[0].changes).toEqual([{ target: 'CAI', before: CAIRO, after: null }]);
  });
});
