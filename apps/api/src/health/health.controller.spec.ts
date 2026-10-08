import type { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller';

function controllerWith(dataSource: Partial<DataSource>): HealthController {
  return new HealthController(dataSource as DataSource);
}

describe('HealthController', () => {
  it('reports the database as connected when a query succeeds', async () => {
    const controller = controllerWith({
      isInitialized: true,
      query: vi.fn().mockResolvedValue([{ result: 1 }]),
    });

    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      database: 'connected',
    });
  });

  it('reports the database as disconnected when a query fails', async () => {
    const controller = controllerWith({
      isInitialized: true,
      query: vi.fn().mockRejectedValue(new Error('connection refused')),
    });

    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      database: 'disconnected',
    });
  });
});
