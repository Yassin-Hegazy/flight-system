import type { Tx } from '../../shared/db';
import type { Money } from '../../shared/money';
import { ok } from '../../shared/result';
import type { Cabin, CatalogApi } from '../flight-catalog/index';

export class UpdateFare {
  readonly name = 'UpdateFare';

  constructor(
    private readonly catalog: CatalogApi,
    private readonly flightId: string,
    private readonly cabin: Cabin,
    private readonly fare: Money,
  ) {}

  async execute(tx: Tx) {
    const changed = await this.catalog.setFare(tx, this.flightId, this.cabin, this.fare);
    if (!changed.ok) return changed;
    return ok({
      value: this.fare,
      audit: [
        {
          target: `${this.flightId}/${this.cabin}`,
          flightId: this.flightId,
          before: changed.value,
          after: this.fare,
        },
      ],
    });
  }
}
