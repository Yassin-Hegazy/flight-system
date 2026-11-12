#!/usr/bin/env node
/**
 * One-command setup (NFR-PORT-01): from a fresh checkout to a demo-ready database.
 *
 *   pnpm install
 *   pnpm bootstrap
 *   pnpm dev
 *
 * It creates the .env files if they are missing, starts PostgreSQL in Docker, applies the
 * migrations and seeds an administrator, a demo traveler and two weeks of flights. Every step is
 * safe to run again.
 *
 *   --skip-docker   PostgreSQL is already running; use the DATABASE_URL in apps/api/.env
 *   --dry-run       print the steps without running them
 */
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const APPS_WITH_ENV = ['apps/api', 'apps/web'];

/** The steps to run, given which files already exist. Pure, so it can be tested. */
export function plan({ exists, skipDocker = false }) {
  const steps = [];
  for (const directory of APPS_WITH_ENV) {
    const target = `${directory}/.env`;
    const example = `${directory}/.env.example`;
    if (!exists(target) && exists(example)) {
      steps.push({ kind: 'copy', label: `Create ${target}`, from: example, to: target });
    }
  }
  if (!skipDocker) {
    steps.push({
      kind: 'run',
      label: 'Start PostgreSQL',
      command: 'docker',
      args: ['compose', 'up', '-d', '--wait'],
      hint: 'Is Docker running? If PostgreSQL runs elsewhere, use: pnpm bootstrap --skip-docker',
    });
  }
  steps.push(
    {
      kind: 'run',
      label: 'Apply migrations',
      command: 'pnpm',
      args: ['--filter', 'api', 'run', 'db:migrate'],
    },
    {
      kind: 'run',
      label: 'Seed demo data',
      command: 'pnpm',
      args: [
        '--filter',
        'api',
        'exec',
        'node',
        '--env-file-if-exists=.env',
        'dist/database/seed-demo.main.js',
      ],
    },
  );
  return steps;
}

function parseArguments(argv) {
  const options = { skipDocker: false, dryRun: false };
  for (const argument of argv) {
    if (argument === '--skip-docker') options.skipDocker = true;
    else if (argument === '--dry-run') options.dryRun = true;
    else return { error: `Unknown option: ${argument}` };
  }
  return { options };
}

const NEXT_STEPS = [
  '',
  'Ready. Start the app with:  pnpm dev',
  '  Web:  http://localhost:3000',
  '  API:  http://localhost:3001   (Swagger: http://localhost:3001/docs)',
  '',
  'Local demo accounts (development only):',
  '  administrator  admin@example.com     Admin-Local-2026!',
  '  traveler       traveler@example.com  Traveler-Local-2026!',
];

/** Runs the setup; returns the process exit code. */
export function main(argv, { exists, copy, run, log = console.log } = {}) {
  const { options, error } = parseArguments(argv);
  if (error) {
    log(error);
    return 2;
  }

  const steps = plan({ exists, skipDocker: options.skipDocker });
  for (const [index, step] of steps.entries()) {
    log(`[${index + 1}/${steps.length}] ${step.label}`);
    if (options.dryRun) continue;
    if (step.kind === 'copy') {
      copy(step.from, step.to);
      continue;
    }
    if (run(step) !== 0) {
      log(`\nFailed: ${step.label}.${step.hint ? ` ${step.hint}` : ''}`);
      return 1;
    }
  }
  if (!options.dryRun) NEXT_STEPS.forEach((line) => log(line));
  return 0;
}

function realEnvironment(root) {
  return {
    exists: (path) => existsSync(join(root, path)),
    copy: (from, to) => copyFileSync(join(root, from), join(root, to)),
    run: (step) =>
      spawnSync(step.command, step.args, {
        cwd: root,
        stdio: 'inherit',
        // On Windows, pnpm and docker are .cmd shims that need a shell.
        shell: process.platform === 'win32',
      }).status ?? 1,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  process.exitCode = main(process.argv.slice(2), realEnvironment(root));
}
