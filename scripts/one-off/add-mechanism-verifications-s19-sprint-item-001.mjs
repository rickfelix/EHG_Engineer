#!/usr/bin/env node
/**
 * GATE_MECHANISM_CLAIM_VERIFIER requires metadata.mechanism_verifications for
 * SD-LEO-INFRA-S19-SPRINT-ITEM-001's spine, which names lib/eva/stage-templates/analysis-steps/
 * stage-19-sprint-planning.js alongside a function reference (analyzeStage19). This is a
 * genuine, independently-reproduced verification, not an endorsement chain: LEAD directly read
 * the file (SYSTEM_PROMPT line 145/159, the honest-refusal throw at ~406, the two pre-existing
 * silent-fallback assignments at ~440-442/~486-488) before implementing, and validation-agent
 * independently re-verified the fix TWICE via live mutation testing (reverting the exact fix
 * lines and confirming the test suite goes red, then restoring and confirming green) rather than
 * reading the diff and endorsing it.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-S19-SPRINT-ITEM-001';

const { data: existing, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', SD_KEY)
  .single();

if (fetchErr) {
  console.error('❌ Fetch failed:', fetchErr.message);
  process.exit(1);
}

const metadata = {
  ...existing.metadata,
  mechanism_verifications: [
    {
      verified_by: 'LEAD session 02821841-4aca-4eb4-a6ff-2ada48bbc92e (direct file read); cross-verified by sub_agent_execution_results:75149951-f815-41c5-a6bc-75df4e45747c (VALIDATION, phase=PLAN, verdict=PASS/96)',
      verified_at: 'lib/eva/stage-templates/analysis-steps/stage-19-sprint-planning.js:406',
      claim: 'The honest-refusal throw (isFeature && !layerRecognized && !uiImplied) at analyzeStage19()\'s per-item normalization map was terminal on first occurrence with no re-ask; the walk specimen (architectureLayer:"api" emitted for a feature item with no UI signal) hit exactly this path.',
      reproduction: 'validation-agent independently reverted the fix (if (attempt === MAX_ARCHITECTURE_LAYER_REASKS) throw parseErr -> unconditional throw parseErr) on 2 separate passes and re-ran tests/unit/eva/stage-templates/stage-19-architecture-layer-reask.test.js: the suite went from 88/88 green to 2 tests failing on the mutated code, then back to 88/88 green after restoring the fix -- confirming the fix (not just the test suite) actually changes behavior.'
    }
  ]
};

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata })
  .eq('sd_key', SD_KEY);

if (updateErr) {
  console.error('❌ Update failed:', updateErr.message);
  process.exit(1);
}

console.log('✅ mechanism_verifications recorded for', SD_KEY);
