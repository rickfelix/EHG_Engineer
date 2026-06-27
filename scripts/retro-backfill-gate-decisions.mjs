#!/usr/bin/env node
// SD-LEO-INFRA-RESERVED-GATE-BYPASS-001 (FR-4): retroactive backfill.
// For ventures that already PASSED a gated stage with no chairman_decision (a silent bypass),
// mint the proper pending chairman gate decision via the canonical createOrReusePendingDecision
// (idempotent — reuses an existing row). Targets all violations by default; pass a venture id to
// scope to one (e.g. venture-1).
//
//   node scripts/retro-backfill-gate-decisions.mjs           # all violations
//   node scripts/retro-backfill-gate-decisions.mjs <ventureId>
//   node scripts/retro-backfill-gate-decisions.mjs --dry     # show, do not write
//   npm run backfill:gate-decisions

import { createClient } from '@supabase/supabase-js';
import { reconcileGateDecisions } from '../lib/eva/reconcile-gate-decisions.mjs';
import { createOrReusePendingDecision } from '../lib/eva/chairman-decision-watcher.js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.');
  process.exit(1);
}

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const onlyVenture = args.find((a) => !a.startsWith('--'));
const supabase = createClient(url, key);

(async () => {
  const { violations } = await reconcileGateDecisions(supabase);
  const target = onlyVenture ? violations.filter((v) => v.venture_id === onlyVenture) : violations;
  if (target.length === 0) {
    console.log('✓ No gate-decision violations to backfill.');
    return;
  }
  console.log(`Backfilling ${target.length} gate-decision violation(s)${dry ? ' [dry-run]' : ''}...`);
  for (const v of target) {
    if (dry) {
      console.log(`[dry] would mint pending chairman_decision: venture ${v.venture_id} stage ${v.stage}`);
      continue;
    }
    const r = await createOrReusePendingDecision({
      ventureId: v.venture_id, stageNumber: v.stage, decisionType: 'stage_gate',
      summary: `Retroactive gate decision for stage ${v.stage} (silent-bypass remediation)`,
      supabase, logger: console,
    });
    console.log(`${r.skipped ? '∅ skipped (non-gate)' : r.isNew ? '✓ minted' : '↺ reused'}: venture ${v.venture_id} stage ${v.stage}${r.id ? ` (decision ${r.id})` : ''}`);
  }
})().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
