#!/usr/bin/env node
/**
 * SD-LEO-INFRA-ALTIFYAI-TEST-IDENTITY-001 (FR-7, SEC-47/SEC-54).
 *
 * tests/unit/docs/venture-hosting-standard-synthetic-actor.test.js's
 * byte-fidelity assertions compare venture-hosting-standard.md against
 * tests/fixtures/fr7-synthetic-actors-source-material.json rather than a
 * live DB call -- vitest's `unit` project deliberately neuters Supabase env
 * vars (SUPABASE_URL -> "https://test.invalid.local") so unit tests can
 * never reach a real database (tests/helpers/db-available.js's own
 * extensive rationale: no non-production Supabase target is provisioned,
 * so DB-gated unit tests would either always-skip or -- the actual
 * historical incident that policy exists to prevent -- run against
 * production).
 *
 * This script is the OTHER half of that two-tier design: run periodically
 * (or on demand) with real credentials, OUTSIDE the vitest unit sandbox, to
 * confirm the committed fixture still matches the live SD row. A mismatch
 * means either the fixture has gone stale (re-run with --write) or the SD's
 * source_material changed and venture-hosting-standard.md needs a
 * corresponding update (do NOT blindly --write in that case -- check which
 * side is actually correct first).
 *
 * Run via: node scripts/regen-fr7-source-material-fixture.mjs [--write]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_PATH = join(root, 'tests', 'fixtures', 'fr7-synthetic-actors-source-material.json');

// SEC-60 (EXEC-TO-PLAN SECURITY, informational): async IIFE + process.exitCode
// instead of process.exit() at each branch -- the Supabase client leaves an
// open handle that process.exit() tears down mid-flight, tripping a
// Windows-only libuv teardown assertion (harmless; the check itself had
// already completed and logged by that point, and ubuntu-latest CI runners
// are unaffected either way) rather than draining naturally.
async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', 'SD-LEO-INFRA-ALTIFYAI-TEST-IDENTITY-001')
    .maybeSingle();
  if (error) throw error;

  const live = sd?.metadata?.source_material?.fr7_synthetic_actors;
  if (!live) {
    console.error('::error::regen-fr7-source-material-fixture: source_material.fr7_synthetic_actors is missing on the live SD row.');
    process.exitCode = 1;
    return;
  }

  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

  const diffs = [];
  if (fixture.verbatim_sentence_must_survive_unchanged !== live.verbatim_sentence_must_survive_unchanged) {
    diffs.push('verbatim_sentence_must_survive_unchanged differs');
  }
  const liveClasses = live.exclusion_classes_THREE_not_two || [];
  const fixtureClasses = fixture.exclusion_classes_THREE_not_two || [];
  if (JSON.stringify(liveClasses) !== JSON.stringify(fixtureClasses)) {
    diffs.push('exclusion_classes_THREE_not_two differs');
  }

  if (diffs.length === 0) {
    console.log('Fixture matches the live SD row. No action needed.');
    process.exitCode = 0;
    return;
  }

  console.error(`::error::regen-fr7-source-material-fixture: fixture has drifted from the live SD row: ${diffs.join(', ')}`);
  if (process.argv.includes('--write')) {
    writeFileSync(FIXTURE_PATH, JSON.stringify({
      ...fixture,
      _captured_at: new Date().toISOString(),
      exclusion_classes_THREE_not_two: liveClasses,
      verbatim_sentence_must_survive_unchanged: live.verbatim_sentence_must_survive_unchanged,
    }, null, 2) + '\n', 'utf8');
    console.log('Fixture rewritten from the live row (--write passed). Re-run venture-hosting-standard.md\'s own drift fix if the DOC needs to change too -- this only updated the fixture.');
    process.exitCode = 0;
    return;
  }
  console.error('Re-run with --write to update the fixture from the live row, after confirming the live row (not the fixture) is the side that should win.');
  process.exitCode = 1;
}

await main();
