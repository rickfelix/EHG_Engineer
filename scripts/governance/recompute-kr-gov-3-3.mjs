#!/usr/bin/env node
/**
 * Recompute KR-GOV-3.3 from honest per-stage OKR-automation health.
 * (QF-20260830-086)
 *
 * Usage:
 *   node scripts/governance/recompute-kr-gov-3-3.mjs            # dry-run (default): report, NO write
 *   node scripts/governance/recompute-kr-gov-3-3.mjs --apply    # governed write to key_results
 *   node scripts/governance/recompute-kr-gov-3-3.mjs --json     # machine-readable
 *
 * main-guarded so recomputeKrGov33/computeOkrStageHealth stay unit-testable.
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { recomputeKrGov33, TARGET_STAGES, KR_CODE } from '../../lib/governance/okr-automation-stage-health.js';

async function main() {
  const apply = process.argv.includes('--apply');
  const json = process.argv.includes('--json');
  const supabase = createSupabaseServiceClient();

  const result = await recomputeKrGov33({ supabase, apply });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  console.log('');
  console.log('='.repeat(64));
  console.log(`  OKR STAGE-HEALTH RECOMPUTE — ${KR_CODE} (${apply ? 'APPLY' : 'DRY-RUN'})`);
  console.log('='.repeat(64));
  console.log('  Stage                       | last real artifact       | running?');
  console.log('  ' + '-'.repeat(62));
  for (const s of result.perStage) {
    const last = s.lastAt ? `${String(s.lastAt).slice(0, 10)} (${s.ageDays}d ago)` : 'never';
    console.log(`  ${s.stage.padEnd(28)} | ${last.padEnd(25)} | ${s.running ? 'RUNNING' : 'stale'}`);
  }
  console.log('  ' + '-'.repeat(62));
  console.log(`  Derived value: ${result.passingCount}/${TARGET_STAGES}  (was ${result.before === null ? 'null' : result.before})  status=${result.status}`);
  console.log(`  ${apply ? (result.wrote ? '✅ written to key_results (last_updated_by=OKR-STAGE-RECOMPUTE)' : '⚠ not written') : 'ℹ dry-run — no write (use --apply)'}`);
  console.log('='.repeat(64));
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error('recompute-kr-gov-3-3 failed:', err?.message || err); process.exit(1); });
}
