#!/usr/bin/env node
/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-J (FR-10) -- weekly graduation-gauge runner.
 *
 * Runs eva-stage-literal-lint.mjs --all and, ONLY on a clean (zero-violation) sweep AND a
 * registry that matches the live venture_stages table, stamps
 * standard_loop:eva-stage-literal-lint-weekly's last_fired_at via stampLastFired(). Either
 * failure intentionally does NOT stamp -- periodic-liveness-watcher.mjs's existing
 * missed-cadence machinery then reads this process as overdue/degraded, making "N consecutive
 * clean weeks" directly observable from the registry row without inventing a second,
 * bespoke violation-history table.
 *
 * The registry-drift check (FR-1's own concern: stage-key-registry.js's STAGE_KEY_BY_NUMBER
 * covering all 27 stages) is checked HERE, not by the lint itself, because this is the one
 * place in the whole pipeline that already holds live DB credentials -- the per-PR lint is
 * deliberately offline/no-DB-access (mirrors stage-advancement-chokepoint-lint.mjs's design).
 *
 * Exit code is non-zero on EITHER a dirty lint sweep OR a registry/DB mismatch, so the GHA
 * workflow step fails loud in both cases even though this script's own job is "stamp on
 * clean", not "gate".
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { stampLastFired } from '../../lib/periodic-liveness/stamp-last-fired.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { STAGE_KEY_BY_NUMBER } from '../../lib/eva/stage-templates/stage-key-registry.js';

const PROCESS_KEY = 'standard_loop:eva-stage-literal-lint-weekly';

/**
 * Compare the static STAGE_KEY_BY_NUMBER map against the live venture_stages table.
 * Returns a list of mismatches (empty = clean). Never throws on a resolvable read.
 */
export async function checkRegistryDrift(supabase) {
  // venture_stages is the canonical, fixed-cardinality stage catalog (27 rows today) -- an
  // explicit limit well above that (not an unbounded read) so a truncated read can never
  // silently pass as "no drift found".
  const { data, error } = await supabase.from('venture_stages').select('stage_number,stage_key').limit(100);
  if (error) throw new Error(`[registry-drift] venture_stages read failed: ${error.message}`);
  if (data.length >= 100) throw new Error(`[registry-drift] venture_stages returned ${data.length} rows, at the read cap -- raise the limit before trusting this comparison.`);

  const mismatches = [];
  const liveByNumber = new Map(data.map((r) => [r.stage_number, r.stage_key]));
  for (const [numStr, key] of Object.entries(STAGE_KEY_BY_NUMBER)) {
    const num = Number(numStr);
    const live = liveByNumber.get(num);
    if (live === undefined) mismatches.push({ stage_number: num, registry: key, live: 'MISSING_LIVE_ROW' });
    else if (live !== key) mismatches.push({ stage_number: num, registry: key, live });
  }
  for (const row of data) {
    // hasOwnProperty, not `in` -- `in` walks the prototype chain, so a stage_number that
    // happened to collide with an Object.prototype member name would read as "present" and
    // silently suppress a real drift report.
    if (!Object.prototype.hasOwnProperty.call(STAGE_KEY_BY_NUMBER, row.stage_number)) {
      mismatches.push({ stage_number: row.stage_number, registry: 'MISSING_FROM_REGISTRY', live: row.stage_key });
    }
  }
  return mismatches;
}

export async function runWeeklyStampCheck() {
  let output = '';
  let code = 0;
  try {
    output = execFileSync('node', ['scripts/lint/eva-stage-literal-lint.mjs', '--all'], { encoding: 'utf8' });
  } catch (err) {
    code = typeof err.status === 'number' ? err.status : 1;
    output = `${err.stdout || ''}${err.stderr || ''}`;
  }
  console.log(output);

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const mismatches = await checkRegistryDrift(supabase);
  if (mismatches.length > 0) {
    console.log(`[weekly-stamp] REGISTRY DRIFT -- ${mismatches.length} mismatch(es): ${JSON.stringify(mismatches)}`);
    if (code === 0) code = 1;
  }

  if (code === 0) {
    const result = await stampLastFired(supabase, PROCESS_KEY);
    console.log(`[weekly-stamp] clean sweep + registry match -- ${JSON.stringify(result)}`);
  } else {
    console.log(`[weekly-stamp] dirty week (exit ${code}) -- NOT stamping. This week does not count toward graduation.`);
  }
  return code;
}

if (isMainModule(import.meta.url)) {
  runWeeklyStampCheck().then((code) => { process.exitCode = code; }).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
