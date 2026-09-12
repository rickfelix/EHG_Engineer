#!/usr/bin/env node
/**
 * GATE_MECHANISM_CLAIM_VERIFIER requires metadata.mechanism_verifications for
 * SD-LEO-FIX-CHAIRMAN-APPROVED-ARMING-001's spine, which asserts a mechanism claim about
 * lib/feature-flags/governance-review.js and scripts/flag-governance-review.mjs (the SD's own
 * title: QF-20260906-235 "folded into" governance review "without touching the three rows").
 * The VALIDATION sub-agent's own genuine, live-verified investigation (evidence row
 * 2194047b-5957-474c-ae5a-17b340333cd1) is the verifier -- it read PR #8781's actual diff,
 * not the SD's own metadata text, to confirm the claim.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-CHAIRMAN-APPROVED-ARMING-001';

const { data: existing, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (fetchErr) { console.error('Fetch failed:', fetchErr.message); process.exit(1); }

const metadata = {
  ...existing.metadata,
  mechanism_verifications: [
    {
      verified_by: 'sub_agent_execution_results:2194047b-5957-474c-ae5a-17b340333cd1 (VALIDATION, phase=LEAD)',
      verified_at: 'scripts/flag-governance-review.mjs:54 (update({last_reviewed_at}) is the only leo_feature_flags write in the file, gated inside the stale-flag digest scan)',
      claim: 'PR #8781 (QF-20260906-235, merged 2026-09-12T16:55:05Z) changed exactly 6 files (flag-reader-scan.js, governance-review.js, flag-governance-review.mjs, a VENTURE_FIXTURE_SWEEP_V1 operator-hold one-off, and 2 unit tests). It is a read/report path only: scripts/flag-governance-review.mjs never writes is_enabled, lifecycle_state, or rolled_out_at for STAGE_GATE_PREDICATE_ARMED, LEO_HIGH_CONSEQUENCE_GATES_ENABLED, or HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED -- its one write touches only last_reviewed_at. This SD\'s own title/description claim ("QF-20260906-235 ... completed ... without touching the three rows") is therefore accurate, not assumed.',
      reproduction: 'Direct diff read of PR #8781 (gh pr diff 8781) plus direct source read of scripts/flag-governance-review.mjs; corroborated by leo_feature_flags.row_version incrementing by exactly 1 from baseline for all three flags at the actual QF-20260912-959 apply timestamp, not at PR #8781\'s merge timestamp.'
    },
    {
      verified_by: 'sub_agent_execution_results:2194047b-5957-474c-ae5a-17b340333cd1 (VALIDATION, phase=LEAD)',
      verified_at: 'lib/feature-flags/governance-review.js:74-77 (classifyFlag: enabledNeverRolledOut = is_enabled===true && !flag.rolled_out_at && age>=ENABLED_UNROLLED_DAYS)',
      claim: 'rolled_out_at is the exact graduation signal governance-review.js reads to stop recommending GRADUATE -- confirming markRolledOut() (this SD\'s own new registry.js writer) is the correct, complete fix for the two HIGH_CONSEQUENCE flags\' recurring GRADUATE nag, not a partial one.',
      reproduction: 'Direct source read of classifyFlag(); cross-checked live against leo_feature_flags rows for the two subject flags before/after markRolledOut() ran.'
    }
  ]
};

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata })
  .eq('sd_key', SD_KEY);
if (updateErr) { console.error('Update failed:', updateErr.message); process.exit(1); }
console.log('mechanism_verifications recorded for', SD_KEY);
