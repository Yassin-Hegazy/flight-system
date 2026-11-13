import type { Tx } from '../../shared/db';
import { ok } from '../../shared/result';
import type { AirportInput, CatalogApi } from '../flight-catalog/index';

export class UpsertAirport {
  readonly name = 'UpsertAirport';

  constructor(
    private readonly catalog: CatalogApi,
    private readonly input: AirportInput,
  ) {}

  async execute(tx: Tx) {
    const before = await this.catalog.lockAirport(tx, this.input.code);
    const result = await this.catalog.upsertAirport(tx, this.input);
    if (!result.ok) return result;
    const after = await this.catalog.airport(result.value, tx);
    return ok({
      value: { code: result.value },
      audit: [{ target: result.value, before, after }],
    });
  }
}

export class DeleteAirport {
  readonly name = 'DeleteAirport';

  constructor(
    private readonly catalog: CatalogApi,
    private readonly code: string,
  ) {}

  async execute(tx: Tx) {
    const before = await this.catalog.lockAirport(tx, this.code);
    const result = await this.catalog.deleteAirport(tx, this.code);
    if (!result.ok) return result;
    return ok({
      value: { code: this.code },
      audit: [{ target: this.code, before, after: null }],
    });
  }
}
