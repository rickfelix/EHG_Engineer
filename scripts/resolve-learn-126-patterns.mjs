#!/usr/bin/env node
/**
 * Mark SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-126 target patterns as resolved.
 *
 * Run AFTER the SD's PR has merged to main, not before — premature resolution
 * creates a false "healed" signal on SDs that may still be rolled back.
 *
 * Usage:
 *   CLAUDE_SESSION_ID=<uuid> node scripts/resolve-learn-126-patterns.mjs
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const RESOLUTIONS = [
  {
    pattern_id: 'PAT-HF-PLANTOEXEC-eaccd2b3',
    notes: 'Resolved by SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-126 Phase 1 — parent-orchestrator PRD allow-list in PlanToExecVerifier.js:319-321 extended to include "in_progress", aligning with prerequisite-preflight.js:268.'
  },
  {
    pattern_id: 'PAT-HF-LEADFINALAPPROVAL-d94c34d8',
    notes: 'Resolved by SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-126 Phase 2 — PLAN-TO-LEAD state-transitions.js throws on SD UPDATE failure (previously logged ⚠️ and continued); lead-final-approval/index.js distinguishes silent-pre-fix-failure from missing-handoff.'
  },
  {
    pattern_id: 'PAT-HF-PLANTOEXEC-4c03f832',
    notes: 'Resolved by SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-126 Phase 3 — buildDefaultImplementationApproach (prd-creator.js) pads to ≥3 phases with file refs; basicPRDValidation (prd-validation.js) warns on thin content shape.'
  },
  {
    pattern_id: 'PAT-RETRO-EXECTOPLAN-0bda95fe',
    notes: 'Resolved by SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-126 Phases 4+5 — resolve-own-session.js surfaces demotedMatches in no_deterministic_identity response; BaseExecutor.js retries assertValidClaim once after 250ms to close marker-file race.'
  },
  {
    pattern_id: 'PAT-HF-EXECTOPLAN-0bda95fe',
    notes: 'Resolved by SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-126 Phases 4+5 — same fixes as PAT-RETRO-EXECTOPLAN-0bda95fe (same dedup_fingerprint, different category).'
  }
];

async function main() {
  const resolutionDate = new Date().toISOString();
  let successCount = 0;
  let errorCount = 0;

  for (const { pattern_id, notes } of RESOLUTIONS) {
    const { data, error } = await supabase
      .from('issue_patterns')
      .update({
        status: 'resolved',
        resolution_date: resolutionDate,
        resolution_notes: notes,
        updated_at: resolutionDate
      })
      .eq('pattern_id', pattern_id)
      .select('pattern_id, status');

    if (error) {
      console.error(`❌ ${pattern_id}: ${error.message}`);
      errorCount += 1;
    } else if (!data?.length) {
      console.warn(`⚠️  ${pattern_id}: no row matched (pattern may already be cleared)`);
    } else {
      console.log(`✅ ${pattern_id} → resolved`);
      successCount += 1;
    }
  }

  console.log(`\nResolved ${successCount}/${RESOLUTIONS.length} patterns (errors: ${errorCount})`);
  if (errorCount > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
