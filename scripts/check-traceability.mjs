#!/usr/bin/env node
/**
 * Story and NFR to test traceability checker (NFR-TEST-01).
 *
 * docs/traceability.json lists the user stories and NFRs the project has to cover. A test covers
 * one by putting its ID and a test number at the start of its title, e.g.
 *     it('US-NT-01-T01 BookingConfirmed notifies the owner', ...)
 * This script finds those titles and lists every registered ID that has no test.
 *
 *   node scripts/check-traceability.mjs                      report everything, always exit 0
 *   node scripts/check-traceability.mjs --through=beta       only beta items (beta | final | stretch)
 *   node scripts/check-traceability.mjs --module=booking     one module
 *   node scripts/check-traceability.mjs --strict             exit 1 if anything is uncovered or unregistered
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MILESTONES = ['beta', 'final', 'stretch'];
const TEST_FILE = /\.(spec|int-spec)\.(ts|tsx)$/;
const SKIPPED_DIRS = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.next',
  '.git',
  'playwright-report',
  'test-results',
]);
// "US-NT-01-T01" or "NFR-SEC-02-T03": the ID is everything before the test number.
const TEST_TITLE_ID = /\b((?:US|NFR)-[A-Z0-9]+-\d{2})-T\d{2}\b/g;

/** Every story or NFR ID that a test title in this source names. */
export function testIdsIn(source) {
  return new Set([...source.matchAll(TEST_TITLE_ID)].map((match) => match[1]));
}

/**
 * Compares the registry with the IDs found in tests.
 * `covered` maps an ID to the files whose test titles name it.
 */
export function evaluate(registry, covered, { through = 'stretch', module } = {}) {
  const limit = MILESTONES.indexOf(through);
  const inScope = registry.filter(
    (entry) =>
      MILESTONES.indexOf(entry.milestone) <= limit &&
      (module === undefined || entry.module === module),
  );

  const tooling = inScope.filter((entry) => entry.verifiedBy === 'tool');
  const tested = inScope.filter((entry) => entry.verifiedBy !== 'tool');
  const registered = new Set(registry.map((entry) => entry.id));

  return {
    through,
    module,
    covered: tested.filter((entry) => covered.has(entry.id)),
    missing: tested.filter((entry) => !covered.has(entry.id)),
    tooling,
    unregistered: [...covered.entries()]
      .filter(([id]) => !registered.has(id))
      .map(([id, files]) => ({ id, files }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    inScope,
  };
}

/** The test files under a folder, skipping dependencies and build output. */
function findTestFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) found.push(...findTestFiles(join(directory, entry.name)));
    } else if (TEST_FILE.test(entry.name)) {
      found.push(join(directory, entry.name));
    }
  }
  return found;
}

function collectCovered(root) {
  const covered = new Map();
  const appsDirectory = join(root, 'apps');
  const files = existsSync(appsDirectory) ? findTestFiles(appsDirectory) : [];
  for (const file of files) {
    for (const id of testIdsIn(readFileSync(file, 'utf8'))) {
      covered.set(id, [...(covered.get(id) ?? []), relative(root, file)]);
    }
  }
  return covered;
}

function summaryLines(result) {
  const modules = [...new Set(result.inScope.map((entry) => entry.module))].sort();
  const width = Math.max(6, ...modules.map((name) => name.length));
  const lines = [`${'Module'.padEnd(width)}  Covered`];
  for (const name of modules) {
    const tested = result.inScope.filter((e) => e.module === name && e.verifiedBy !== 'tool');
    const done = tested.filter((e) => result.covered.includes(e)).length;
    const tools = result.tooling.filter((e) => e.module === name).length;
    lines.push(
      `${name.padEnd(width)}  ${done}/${tested.length}${tools ? `  (+${tools} by tooling)` : ''}`,
    );
  }
  return lines;
}

/** A titled list, or nothing at all when the list is empty. */
function section(title, rows) {
  return rows.length === 0 ? [] : ['', title, ...rows.map((row) => `  ${row}`)];
}

export function render(result) {
  const scope = [`through ${result.through}`, result.module && `module ${result.module}`]
    .filter(Boolean)
    .join(', ');
  const missing = result.missing.map(
    (entry) => `${entry.id.padEnd(14)} ${entry.title}  [${entry.module}, ${entry.milestone}]`,
  );
  const tooling = result.tooling.map((entry) => `${entry.id.padEnd(14)} ${entry.check ?? ''}`);
  const unregistered = result.unregistered.map(
    ({ id, files }) => `${id.padEnd(14)} ${files.join(', ')}`,
  );

  const allGood =
    missing.length === 0 && unregistered.length === 0
      ? ['', 'Every registered story and NFR in scope has a test.']
      : [];
  return [
    `Story and NFR traceability (${scope})`,
    '',
    ...summaryLines(result),
    ...section(`No test names these (${missing.length}):`, missing),
    ...section('Verified by tooling, not by a test name:', tooling),
    ...section('Named by tests but missing from docs/traceability.json:', unregistered),
    ...allGood,
  ].join('\n');
}

function parseArguments(argv) {
  const options = { strict: false, through: 'stretch', module: undefined };
  for (const argument of argv) {
    if (argument === '--strict') options.strict = true;
    else if (argument.startsWith('--through='))
      options.through = argument.slice('--through='.length);
    else if (argument.startsWith('--module=')) options.module = argument.slice('--module='.length);
    else return { error: `Unknown option: ${argument}` };
  }
  if (!MILESTONES.includes(options.through)) {
    return { error: `--through must be one of: ${MILESTONES.join(', ')}` };
  }
  return { options };
}

/** Runs the checker; returns the process exit code. */
export function main(argv, { root, log = console.log } = {}) {
  const projectRoot = root ?? resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const { options, error } = parseArguments(argv);
  if (error) {
    log(error);
    return 2;
  }

  const registryPath = join(projectRoot, 'docs', 'traceability.json');
  if (!existsSync(registryPath)) {
    log(`Registry not found: ${registryPath}`);
    return 2;
  }
  const { items } = JSON.parse(readFileSync(registryPath, 'utf8'));

  const result = evaluate(items, collectCovered(projectRoot), options);
  log(render(result));
  const failing = result.missing.length > 0 || result.unregistered.length > 0;
  return options.strict && failing ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
