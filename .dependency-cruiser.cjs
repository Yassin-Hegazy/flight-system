// Architecture rules for the modular monolith. Run with `pnpm depcruise`.
const MODULES = '^apps/api/src/modules/';
const MODULE_INDEX = '^apps/api/src/modules/[^/]+/index\\.ts$';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'module-public-api-only',
      comment:
        "A module may import another module only through that module's index.ts (its public API).",
      severity: 'error',
      from: { path: `${MODULES}([^/]+)/` },
      to: {
        path: MODULES,
        pathNot: [`${MODULES}$1/`, MODULE_INDEX],
      },
    },
    {
      name: 'outside-code-uses-module-index-only',
      comment:
        'Code outside modules/ (app.module.ts, tests, ...) may import a module only through its index.ts.',
      severity: 'error',
      from: { pathNot: MODULES },
      to: {
        path: MODULES,
        pathNot: MODULE_INDEX,
      },
    },
    {
      name: 'no-circular-between-modules',
      comment: 'Modules must not depend on each other in a cycle.',
      severity: 'error',
      from: { path: `${MODULES}([^/]+)/` },
      to: {
        circular: true,
        // The cycle passes through at least one other module.
        via: { path: MODULES, pathNot: `${MODULES}$1/` },
      },
    },
    {
      name: 'shared-does-not-import-modules',
      comment: 'shared/ holds framework-level helpers and must not depend on any module.',
      severity: 'error',
      from: { path: '^apps/api/src/shared/' },
      to: { path: MODULES },
    },
    {
      name: 'web-does-not-import-api',
      comment: 'The frontend talks to the API over HTTP only; it must not import API code.',
      severity: 'error',
      from: { path: '^apps/web/' },
      to: { path: '^apps/api/' },
    },
    {
      name: 'not-to-unresolvable',
      comment:
        'Relative and "@/" imports must resolve, otherwise the rules above cannot check them. ' +
        'Package imports are verified by the type checker.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true, path: '^(\\.|@/)' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: {
      path: ['(^|/)node_modules/', '(^|/)dist/', '(^|/)coverage/', '^apps/web/\\.next/'],
    },
    tsPreCompilationDeps: true,
    // Resolves the web app's "@/*" path alias from the repository root.
    tsConfig: { fileName: 'tsconfig.depcruise.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.mts', '.js', '.mjs', '.cjs', '.json'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
