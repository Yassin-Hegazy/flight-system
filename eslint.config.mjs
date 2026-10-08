// One ESLint configuration for the whole repository.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const WEB_FILES = ['apps/web/**/*.{js,jsx,mjs,ts,tsx,mts,cts}'];

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/coverage/',
    'apps/web/.next/',
    'apps/web/out/',
    'apps/web/next-env.d.ts',
    'apps/web/playwright-report/',
    'apps/web/test-results/',
  ]),

  // Every file: JavaScript and TypeScript recommendations, with type information.
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Plain JavaScript config files are not part of any tsconfig.
    files: ['**/*.{js,cjs,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // API (NestJS, Node).
  {
    files: ['apps/api/**/*.ts', 'apps/api/**/*.mts'],
    languageOptions: { globals: globals.node },
  },
  {
    // Supertest response bodies are typed as `any`.
    files: ['apps/api/test/**/*.ts', 'apps/api/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },

  // Web (Next.js): Next.js, React, React Hooks, jsx-a11y and import rules, scoped to apps/web.
  ...nextCoreWebVitals
    .filter((config) => config.name !== 'next/typescript' && !isIgnoresOnly(config))
    .map((config) => ({ ...config, files: WEB_FILES })),
  {
    files: WEB_FILES,
    settings: { next: { rootDir: 'apps/web/' } },
    languageOptions: {
      // eslint-config-next sets its own parser; type-aware rules need the typescript-eslint parser.
      parser: tseslint.parser,
      globals: globals.browser,
    },
  },

  // Formatting is Prettier's job; turn off rules that would conflict with it. Must be last.
  prettier,
]);

function isIgnoresOnly(config) {
  return Object.keys(config).length === 1 && 'ignores' in config;
}
