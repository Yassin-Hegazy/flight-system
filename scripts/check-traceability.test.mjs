// Tests for the traceability checker (NFR-TEST-01). Run with: node --test scripts
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { evaluate, main, testIdsIn } from './check-traceability.mjs';

const item = (id, extra = {}) => ({
  id,
  module: 'notifications',
  title: `Title of ${id}`,
  milestone: 'beta',
  verifiedBy: 'test',
  ...extra,
});

describe('NFR-TEST-01 finding IDs in test names', () => {
  it('NFR-TEST-01-T01 finds every story and NFR ID that a test title names', () => {
    const source = `
      it('US-NT-01-T01 BookingConfirmed notifies the owner', () => {});
      it("NFR-OBS-01-T02 failures are logged", () => {});
      it(\`US-USR-05-T10 template titles count\`, () => {});
    `;
    assert.deepEqual([...testIdsIn(source)].sort(), ['NFR-OBS-01', 'US-NT-01', 'US-USR-05']);
  });

  it('NFR-TEST-01-T01 one title naming several IDs counts for each of them', () => {
    const source = `it('US-NT-02-T01 a delay reaches owners; US-NT-02-T03 others get nothing / NFR-PRIV-01-T01 x', () => {});`;
    assert.deepEqual([...testIdsIn(source)].sort(), ['NFR-PRIV-01', 'US-NT-02']);
  });

  it('NFR-TEST-01-T02 an ID that is only mentioned, with no test number, is not a test', () => {
    const source = `// US-NT-03 is described here\n describe('US-NT-03 Mark a notification as read', () => {});`;
    assert.equal(testIdsIn(source).size, 0);
  });
});

describe('NFR-TEST-01 comparing the registry with the tests', () => {
  const registry = [
    item('US-NT-01'),
    item('US-NT-02', { milestone: 'final' }),
    item('US-NT-07', { milestone: 'stretch' }),
  ];
  const covered = new Map([['US-NT-01', ['a.spec.ts']]]);

  it('NFR-TEST-01-T03 lists the IDs that have no matching test', () => {
    const result = evaluate(registry, covered, { through: 'stretch' });
    assert.deepEqual(
      result.missing.map((m) => m.id),
      ['US-NT-02', 'US-NT-07'],
    );
    assert.deepEqual(
      result.covered.map((m) => m.id),
      ['US-NT-01'],
    );
  });

  it('NFR-TEST-01-T04 only checks the milestones up to the one asked for', () => {
    assert.deepEqual(evaluate(registry, covered, { through: 'beta' }).missing, []);
    assert.deepEqual(
      evaluate(registry, covered, { through: 'final' }).missing.map((m) => m.id),
      ['US-NT-02'],
    );
  });

  it('NFR-TEST-01-T05 can be limited to one module', () => {
    const mixed = [item('US-NT-01'), item('US-USR-01', { module: 'users-access' })];
    const result = evaluate(mixed, new Map(), { through: 'stretch', module: 'users-access' });
    assert.deepEqual(
      result.missing.map((m) => m.id),
      ['US-USR-01'],
    );
  });

  it('NFR-TEST-01-T06 an ID verified by a tool is not expected to have a test name', () => {
    const tooled = [item('NFR-MAINT-01', { verifiedBy: 'tool', check: 'pnpm depcruise' })];
    const result = evaluate(tooled, new Map(), { through: 'stretch' });
    assert.deepEqual(result.missing, []);
    assert.deepEqual(
      result.tooling.map((t) => t.id),
      ['NFR-MAINT-01'],
    );
  });

  it('NFR-TEST-01-T07 reports test IDs that are missing from the registry', () => {
    const result = evaluate(
      registry,
      new Map([
        ['US-NT-01', ['a']],
        ['US-XX-09', ['b.spec.ts']],
      ]),
      {
        through: 'stretch',
      },
    );
    assert.deepEqual(result.unregistered, [{ id: 'US-XX-09', files: ['b.spec.ts'] }]);
  });
});

describe('NFR-TEST-01 the command line', () => {
  function project(registry, testSource) {
    const root = mkdtempSync(join(tmpdir(), 'trace-'));
    mkdirSync(join(root, 'docs'));
    mkdirSync(join(root, 'apps', 'api', 'src'), { recursive: true });
    mkdirSync(join(root, 'apps', 'api', 'node_modules', 'x'), { recursive: true });
    writeFileSync(join(root, 'docs', 'traceability.json'), JSON.stringify({ items: registry }));
    writeFileSync(join(root, 'apps', 'api', 'src', 'a.spec.ts'), testSource);
    // Test files inside node_modules must never count.
    writeFileSync(
      join(root, 'apps', 'api', 'node_modules', 'x', 'b.spec.ts'),
      `it('US-NT-09-T01 x', () => {})`,
    );
    return root;
  }
  const run = (args, root) => {
    const lines = [];
    const code = main(args, { root, log: (line) => lines.push(line) });
    return { code, output: lines.join('\n') };
  };

  it('NFR-TEST-01-T08 prints the gaps but exits 0 by default', () => {
    const root = project([item('US-NT-01'), item('US-NT-02')], `it('US-NT-01-T01 ok', () => {})`);
    const { code, output } = run([], root);
    assert.equal(code, 0);
    assert.match(output, /US-NT-02/);
  });

  it('NFR-TEST-01-T09 with --strict, a missing test fails the run so CI can block it', () => {
    const root = project([item('US-NT-01'), item('US-NT-02')], `it('US-NT-01-T01 ok', () => {})`);
    assert.equal(run(['--strict'], root).code, 1);
  });

  it('NFR-TEST-01-T09 with --strict, everything covered passes', () => {
    const root = project([item('US-NT-01')], `it('US-NT-01-T01 ok', () => {})`);
    assert.equal(run(['--strict'], root).code, 0);
  });

  it('NFR-TEST-01-T10 files in node_modules are ignored', () => {
    const root = project([item('US-NT-09')], `it('US-NT-01-T01 ok', () => {})`);
    assert.match(run([], root).output, /US-NT-09/);
  });

  it('NFR-TEST-01-T11 an unknown option is an error, not silently ignored', () => {
    const root = project([item('US-NT-01')], '');
    assert.equal(run(['--strcit'], root).code, 2);
  });
});
