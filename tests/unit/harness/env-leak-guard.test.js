import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * QF-20260713-897 — unit-vitest .env leak guard (retro action item, SD 5b334fdd).
 *
 * DEFECT: library modules called dotenv.config() (or the ancestor-walk equivalent) at
 * MODULE SCOPE. Any unit test transitively importing them (e.g. analyzeStageNN →
 * artifact-persistence-service / eva-orchestrator-helpers → … → lib/supabase-client.js)
 * loaded the REAL .env into the unit-vitest project, which must never reach the live DB
 * (tests/setup.unit.js deliberately stubs SUPABASE_URL/keys and does NOT load .env).
 *
 * FIX: each module-level .env load is gated behind a test-runner check
 * `if (!process.env.VITEST && process.env.NODE_ENV !== 'test') <load>`. Real processes
 * still load .env; the unit lane never does. This test pins that every guarded loader in
 * the analyzeStage11 transitive chain keeps its guard (else the leak silently returns).
 */

const ROOT = process.cwd();
const GUARDED = [
  'lib/supabase-client.js',
  'lib/supabase-client.cjs',
  'lib/eva/bridge/repo-readiness.js',
  'lib/eva/bridge/replit-repo-seeder.js',
  'lib/eva/stage-execution-engine.js',
  'lib/eva/stage-registry.js',
];

describe('unit-lane .env leak guard (QF-20260713-897)', () => {
  for (const rel of GUARDED) {
    const src = readFileSync(join(ROOT, rel), 'utf8');

    it(`${rel}: the module-scope .env load is gated by the test-runner guard`, () => {
      // The module still performs a dotenv load (not accidentally deleted) — matches both
      // ESM `dotenv.config(` and CJS `require('dotenv').config(`.
      expect(
        /\.config\(/.test(src) && /dotenv/.test(src),
        `${rel} should still perform a dotenv load for real processes`,
      ).toBe(true);
      // ...and the load (or its invocation, for the ancestor-walk in supabase-client)
      // is gated behind the canonical test-runner guard so the unit lane never loads .env.
      expect(
        /!process\.env\.VITEST\b/.test(src) && /process\.env\.NODE_ENV\s*!==\s*['"]test['"]/.test(src),
        `${rel} is MISSING the "!process.env.VITEST && process.env.NODE_ENV !== 'test'" guard — it will leak .env into the unit lane`,
      ).toBe(true);
    });
  }

  it('the guard predicate is inert here (this test IS the unit runner)', () => {
    // Sanity: under vitest, process.env.VITEST is set, so the guard skips the load.
    expect(!!process.env.VITEST || process.env.NODE_ENV === 'test').toBe(true);
  });
});
