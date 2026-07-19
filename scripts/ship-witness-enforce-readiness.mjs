#!/usr/bin/env node
/**
 * On-demand adoption-readiness report for the Ship-witness enforce-flip.
 *
 * SD-LEO-INFRA-SHIP-WITNESS-ENFORCE-001 (Ship-witness D) FR-2. This script only REPORTS — it
 * never flips SHIP_WITNESS_ENFORCE_MODE or writes anything. A human/Adam consults it before
 * deciding whether activating enforcement (a separate, future SD) is safe.
 *
 * Usage: node scripts/ship-witness-enforce-readiness.mjs [--json]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  PLATFORM_REPOS,
  WITNESS_CUTOVER_ISO,
  defaultFetchMergedPlatformPRs,
  computeAdoptionReadiness,
  fetchAllWitnessRows,
} from '../lib/ship/witness-adoption.mjs';

const JSON_MODE = process.argv.includes('--json');

function ghRunner(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8' });
  return { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/**
 * SD-LEO-INFRA-SHIP-WITNESS-COVERAGE-001 FR-3: extracted from main() so this SD's verification
 * test (TS-10) can assert no caching/memoization layer sits between invocations — both the gh
 * fetch and the merge_witness_telemetry query re-run in full on every call, with no shared
 * module-level state carried across calls. Byte-identical behavior to before this SD; main()
 * below is now a thin wrapper handling env/client setup and output formatting.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ fetchMerges?: Function }} [deps]
 */
export async function computeLiveReadiness(supabase, { fetchMerges } = {}) {
  const fetch = fetchMerges || ((owner, name) => defaultFetchMergedPlatformPRs(owner, name, WITNESS_CUTOVER_ISO, ghRunner));
  const merges = PLATFORM_REPOS.flatMap((r) => fetch(r.owner, r.name));
  // QF-20260719-201: paginated read — the bare select truncated at PostgREST's 1000-row default.
  const telemetryRows = await fetchAllWitnessRows(supabase);
  return computeAdoptionReadiness({ merges, telemetryRows });
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1); }
  const supabase = createClient(url, key);

  let readiness;
  try {
    readiness = await computeLiveReadiness(supabase);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  if (JSON_MODE) {
    console.log(JSON.stringify(readiness));
  } else {
    console.log(`Ship-witness enforce-flip readiness: ${readiness.ready ? 'READY' : 'NOT READY'}`);
    console.log(`  ${readiness.reason}`);
    console.log(`  Cutover: ${WITNESS_CUTOVER_ISO}`);
    for (const day of readiness.dailyBreakdown) {
      console.log(`  ${day.day}: ${day.total} merge(s), ${day.unwitnessed} unwitnessed`);
    }
  }
  process.exit(0);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((e) => { console.error('UNHANDLED: ' + (e?.message || e)); process.exit(1); });
}
