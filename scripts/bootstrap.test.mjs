// Tests for the one-command setup (NFR-PORT-01). Run with: node --test scripts/bootstrap.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { main, plan } from './bootstrap.mjs';

const nothingExists = () => false;
const onlyExamplesExist = (path) => path.endsWith('.env.example');
const everythingExists = () => true;

describe('NFR-PORT-01 the setup plan', () => {
  it('NFR-PORT-01-T07 creates each missing .env from its example', () => {
    const copies = plan({ exists: onlyExamplesExist }).filter((step) => step.kind === 'copy');
    assert.deepEqual(
      copies.map((step) => step.to),
      ['apps/api/.env', 'apps/web/.env'],
    );
  });

  it('NFR-PORT-01-T07 never overwrites a .env that already exists', () => {
    const copies = plan({ exists: everythingExists }).filter((step) => step.kind === 'copy');
    assert.deepEqual(copies, []);
  });

  it('NFR-PORT-01-T07 does not try to copy an example that is missing', () => {
    assert.deepEqual(
      plan({ exists: nothingExists }).filter((step) => step.kind === 'copy'),
      [],
    );
  });

  it('NFR-PORT-01-T08 starts the database, migrates, then seeds, in that order', () => {
    const labels = plan({ exists: everythingExists }).map((step) => step.label);
    assert.deepEqual(labels, ['Start PostgreSQL', 'Apply migrations', 'Seed demo data']);
  });

  it('NFR-PORT-01-T08 can skip Docker when PostgreSQL already runs elsewhere', () => {
    const labels = plan({ exists: everythingExists, skipDocker: true }).map((step) => step.label);
    assert.deepEqual(labels, ['Apply migrations', 'Seed demo data']);
  });
});

describe('NFR-PORT-01 running the setup', () => {
  const run = (args, { failOn } = {}) => {
    const ran = [];
    const lines = [];
    const code = main(args, {
      exists: everythingExists,
      copy: () => {},
      run: (step) => {
        ran.push(step.label);
        return step.label === failOn ? 1 : 0;
      },
      log: (line) => lines.push(line),
    });
    return { code, ran, output: lines.join('\n') };
  };

  it('NFR-PORT-01-T09 runs every step and says how to start the app', () => {
    const { code, ran, output } = run([]);
    assert.equal(code, 0);
    assert.deepEqual(ran, ['Start PostgreSQL', 'Apply migrations', 'Seed demo data']);
    assert.match(output, /pnpm dev/);
  });

  it('NFR-PORT-01-T09 stops at the first failing step instead of carrying on', () => {
    const { code, ran, output } = run([], { failOn: 'Apply migrations' });
    assert.equal(code, 1);
    assert.deepEqual(ran, ['Start PostgreSQL', 'Apply migrations']);
    assert.match(output, /Apply migrations/);
  });

  it('NFR-PORT-01-T10 --dry-run lists the steps and runs none of them', () => {
    const { code, ran, output } = run(['--dry-run']);
    assert.equal(code, 0);
    assert.deepEqual(ran, []);
    assert.match(output, /Seed demo data/);
  });

  it('NFR-PORT-01-T10 an unknown option is an error', () => {
    assert.equal(run(['--dryrun']).code, 2);
  });
});
