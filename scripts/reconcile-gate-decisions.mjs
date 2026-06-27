#!/usr/bin/env node
// SD-LEO-INFRA-RESERVED-GATE-BYPASS-001 (FR-3): CLI reconciliation guard.
// Lists every (venture, gated-stage) the venture has PASSED with no chairman_decision row —
// a silent promotion-gate bypass. Exit 1 when violations exist (CI-friendly).
//
//   node scripts/reconcile-gate-decisions.mjs
//   npm run reconcile:gate-decisions

import { createClient } from '@supabase/supabase-js';
import { reconcileGateDecisions } from '../lib/eva/reconcile-gate-decisions.mjs';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.');
  process.exit(1);
}

const supabase = createClient(url, key);

reconcileGateDecisions(supabase)
  .then(({ violations, checked }) => {
    if (violations.length === 0) {
      console.log(`✓ Gate-decision reconciliation: ${checked} venture(s) checked, 0 violations.`);
      process.exit(0);
    }
    console.error(`❌ Gate-decision reconciliation: ${violations.length} silent-bypass violation(s) across ${checked} venture(s):`);
    for (const v of violations) console.error(`   - venture ${v.venture_id} passed gated stage ${v.stage} with NO chairman_decision`);
    process.exit(1);
  })
  .catch((e) => {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  });
