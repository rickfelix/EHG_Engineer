#!/usr/bin/env node
/**
 * CLI wrapper for the cross-venture quality-finding aggregator.
 *
 * Usage:
 *   node scripts/aggregate-quality-findings.js              # write patterns to DB
 *   node scripts/aggregate-quality-findings.js --dry-run    # preview only, no DB writes
 *
 * SD: SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-F
 */

import { createClient } from '@supabase/supabase-js';
import { aggregateFindings, upsertPatterns } from '../lib/eva/quality-findings/aggregator.js';

function parseArgs(argv) {
  const args = { dryRun: false, minVentureCount: 3 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    if (argv[i] === '--min-venture-count' && argv[i + 1]) {
      args.minVentureCount = parseInt(argv[i + 1], 10);
      i++;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const runId = `aggregate-${Date.now()}`;

  console.log(`[${runId}] starting; dry-run=${args.dryRun} min-venture-count=${args.minVentureCount}`);

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const { data: findings, error } = await supabase
    .from('venture_quality_findings')
    .select('id, venture_id, finding_category, severity, check_name, created_at')
    .eq('status', 'open');

  if (error) {
    console.error(`[${runId}] read failed:`, error.message);
    process.exit(1);
  }

  console.log(`[${runId}] read ${findings.length} open finding(s)`);

  const patterns = aggregateFindings(findings, { minVentureCount: args.minVentureCount });
  console.log(`[${runId}] aggregated ${patterns.length} pattern(s) (>= ${args.minVentureCount} ventures)`);

  if (args.dryRun) {
    console.log(`[${runId}] DRY RUN — would write:`);
    for (const p of patterns) {
      console.log(`  ${p.pattern_id}  ${p.finding_category}/${p.severity}/${p.check_name}  ventures=${p.venture_count}`);
    }
    console.log(`[${runId}] dry-run complete; no DB writes`);
    process.exit(0);
  }

  const result = await upsertPatterns(supabase, patterns);
  console.log(`[${runId}] upsert: inserted=${result.inserted} updated=${result.updated} errors=${result.errors.length}`);
  if (result.errors.length) {
    for (const e of result.errors) console.error(`  ${e.pattern_id}: ${e.error}`);
    process.exit(1);
  }

  console.log(`[${runId}] done`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
