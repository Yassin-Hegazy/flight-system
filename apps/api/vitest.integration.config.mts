import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Integration tests: test/**/*.int-spec.ts, run against a real PostgreSQL started by Testcontainers.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.int-spec.ts'],
    environment: 'node',
    setupFiles: ['reflect-metadata'],
    // Pulling and starting a container can take a while on the first run.
    hookTimeout: 180_000,
    testTimeout: 30_000,
  },
});
