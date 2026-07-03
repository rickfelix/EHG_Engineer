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
} from '../lib/ship/witness-adoption.mjs';

const JSON_MODE = process.argv.includes('--json');

function ghRunner(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8' });
  return { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' };
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1); }
  const supabase = createClient(url, key);

  const merges = PLATFORM_REPOS.flatMap((r) => defaultFetchMergedPlatformPRs(r.owner, r.name, WITNESS_CUTOVER_ISO, ghRunner));
  const { data: telemetryRows, error } = await supabase.from('merge_witness_telemetry').select('repo, pr_number');
  if (error) { console.error('merge_witness_telemetry query failed: ' + error.message); process.exit(1); }

  const readiness = computeAdoptionReadiness({ merges, telemetryRows });

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
