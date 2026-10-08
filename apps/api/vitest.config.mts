import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Unit tests: any *.spec.ts file under src/, wherever the module owner puts it.
export default defineConfig({
  // SWC emits the decorator metadata that NestJS dependency injection relies on.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    // NestJS loads this polyfill at runtime; unit tests that skip Nest still need it.
    setupFiles: ['reflect-metadata'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts', 'src/database/migrations/**'],
      reporter: ['text-summary', 'html', 'lcov'],
    },
  },
});
