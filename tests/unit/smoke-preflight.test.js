/**
 * Unit-tier pre-commit smoke gate.
 *
 * WHY THIS FILE EXISTS: the husky pre-commit hook runs `npm run test:smoke`, which pointed at
 * tests/smoke.test.js. That file is a member of DB_INCLUDE, so when QF-20260726-459 Part 1b
 * (d031c798) gated the db project's include to [] — which it does on every machine, because
 * DESIGNATED_NON_PROD_REFS is empty and VITEST_DB_ALLOW_REF is unset — the filter resolved ZERO
 * files, vitest exited 1, and NO commit could be made on any feat/ or qf/ branch fleet-wide.
 * Workers began reaching for `git commit --no-verify`, which also disables secret detection,
 * protected-table write enforcement and the DB-test guard: a velocity outage compounding into a
 * security one.
 *
 * The gate itself was CORRECT and is deliberately left intact. Before it landed, this hook was
 * firing 15 live assertions against the PRODUCTION Supabase project on every developer commit.
 * tests/smoke.test.js stays in DB_INCLUDE where it belongs (it calls dotenv.config() and builds a
 * real Supabase client); the pre-commit gate simply stops depending on the DB tier.
 *
 * CONSTRAINTS THIS FILE MUST KEEP: no dotenv, no Supabase client, no network, no DB. Everything
 * here is filesystem- and parse-level so it runs identically offline (the branch-prefix exemption
 * at .husky/pre-commit:450 exists because the old smoke suite failed offline on DNS ENOTFOUND).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));

describe('smoke: repository integrity', () => {
  it('package.json parses and declares the scripts the protocol depends on', () => {
    for (const script of ['test', 'test:smoke', 'lint']) {
      expect(pkg.scripts, `package.json scripts.${script} is missing`).toHaveProperty(script);
    }
  });

  it('the core entry points referenced by CLAUDE.md exist on disk', () => {
    for (const rel of [
      'scripts/handoff.js',
      'scripts/add-prd-to-database.js',
      'scripts/leo-create-sd.js',
      'CLAUDE.md',
      'vitest.config.js',
    ]) {
      expect(fs.existsSync(path.join(REPO_ROOT, rel)), `${rel} is missing`).toBe(true);
    }
  });

  it('core runtime dependencies resolve', async () => {
    for (const dep of ['dotenv', '@supabase/supabase-js']) {
      await expect(import(dep), `${dep} failed to resolve`).resolves.toBeDefined();
    }
  });
});

/**
 * The regression guard for the outage that motivated this file.
 *
 * A test script whose path resolves to zero files does not fail loudly at authoring time — it
 * fails later, at someone else's commit, as an opaque "No test files found, exiting with code 1".
 * This asserts that every path a test script points at still exists, so a config or layout change
 * that orphans a runner is caught HERE rather than by blocking the fleet.
 *
 * It deliberately checks file EXISTENCE rather than vitest project resolution: existence is cheap,
 * offline, and catches the deletion/move case. Full "does this resolve under some project" checking
 * belongs in CI, where the projects can actually be enumerated.
 */
describe('smoke: test scripts point at paths that exist', () => {
  const LITERAL_PATH = /(?:^|\s)(tests\/[A-Za-z0-9_\-./]+\.(?:test|spec)\.[cm]?[jt]s)(?:\s|$)/g;

  const offenders = [];
  for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
    if (typeof cmd !== 'string' || !cmd.includes('vitest')) continue;
    for (const m of cmd.matchAll(LITERAL_PATH)) {
      const rel = m[1];
      if (!fs.existsSync(path.join(REPO_ROOT, rel))) offenders.push(`${name} -> ${rel}`);
    }
  }

  it('every literal test path in a vitest script exists', () => {
    expect(offenders, `orphaned test paths:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });
});
