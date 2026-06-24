#!/usr/bin/env node
/**
 * Recompute KR-GOV-3.1 from honest per-layer cascade health.
 * (SD-LEO-INFRA-CASCADE-KR-RECOMPUTE-GOV31-001)
 *
 * Usage:
 *   node scripts/governance/recompute-cascade-kr.mjs            # dry-run (default): report, NO write
 *   node scripts/governance/recompute-cascade-kr.mjs --apply    # governed write to key_results
 *   node scripts/governance/recompute-cascade-kr.mjs --json     # machine-readable
 *
 * main-guarded so recomputeKrGov31/computeCascadeHealth stay unit-testable.
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { recomputeKrGov31, TARGET_LAYERS, KR_CODE } from '../../lib/governance/cascade-layer-health.js';

async function main() {
  const apply = process.argv.includes('--apply');
  const json = process.argv.includes('--json');
  const supabase = createSupabaseServiceClient();

  const result = await recomputeKrGov31({ supabase, apply });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  console.log('');
  console.log('='.repeat(64));
  console.log(`  CASCADE KR RECOMPUTE — ${KR_CODE} (${apply ? 'APPLY' : 'DRY-RUN'})`);
  console.log('='.repeat(64));
  const icon = (b) => (b ? '+' : 'X');
  console.log('  Layer         | data | cli | validator | PASS');
  console.log('  ' + '-'.repeat(50));
  for (const l of result.perLayer) {
    console.log(`  ${l.layer.padEnd(13)} |  ${icon(l.dataRows)}   |  ${icon(l.cliResolves)}  |     ${icon(l.validatorReads)}     |  ${l.pass ? 'PASS' : 'fail'}`);
  }
  console.log('  ' + '-'.repeat(50));
  console.log(`  Derived value: ${result.passingCount}/${TARGET_LAYERS}  (was ${result.before === null ? 'null' : result.before})  status=${result.status}`);
  console.log(`  ${apply ? (result.wrote ? '✅ written to key_results (last_updated_by=CASCADE-RECOMPUTE)' : '⚠ not written') : 'ℹ dry-run — no write (use --apply)'}`);
  console.log('='.repeat(64));
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error('recompute-cascade-kr failed:', err?.message || err); process.exit(1); });
}
