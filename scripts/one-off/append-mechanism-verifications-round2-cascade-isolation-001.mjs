import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID = '86a0cc7f-169e-407a-8905-0d103f40b801';
const VERIFIED_BY = 'VALIDATION (evidence 5348003b-106b-4271-b94d-2ca3dcf5a358), cross-verified LEAD (direct read)';

const round2_verifications = [
  {
    claim: "selectNextSD is the PRIMARY cascade picker (reached via executeAutoChain whenever a session context exists), distinct from and more frequently taken than findNextAvailableOrchestrator. Its own .select('id, sd_key, title, status, priority, parent_sd_id, category, current_phase') has ZERO eligibility-relevant columns and ZERO calls to classifyDispatchIneligibility -- round 1's claim that fixing findNextAvailableOrchestrator alone 'closes both call sites' was FALSE.",
    verified_by: VERIFIED_BY,
    verified_at: 'scripts/modules/handoff/queue-selector.js:33 (independently grep-confirmed: no classifyDispatchIneligibility/requires_human_action references in the file)',
  },
  {
    claim: "findNextAvailableOrchestrator's own candidate-select ('id, sd_key, title, status, priority, parent_sd_id') also omits metadata -- wiring classifyDispatchIneligibility in as-is would read row.metadata.requires_human_action as undefined and fail open, blocking nothing. Both pickers need their select widened AND the eligibility call added.",
    verified_by: VERIFIED_BY,
    verified_at: 'scripts/modules/handoff/orchestrator-completion-hook.js:174-179 (independently confirmed via direct read: no metadata column in the select)',
  },
  {
    claim: "Round-1's own citation of this file at 'scripts/modules/handoff/cli/orchestrator-completion-hook.js:175-182' was WRONG -- no cli/ subdirectory exists for this file. Corrected path/lines below.",
    verified_by: VERIFIED_BY,
    verified_at: 'scripts/modules/handoff/orchestrator-completion-hook.js:153-210 (independently confirmed: ls fails on the cli/ path, succeeds on this one)',
  },
  {
    claim: 'The cache-before/reprint-after shape has two bypasses: the parallelExecution early return (~L1158) exits before any post-loop code, and there is no try/catch anywhere in the chaining loop, so a thrown exception also skips the reprint. Must be try/finally.',
    verified_by: 'VALIDATION (evidence 5348003b-106b-4271-b94d-2ca3dcf5a358)',
    verified_at: 'scripts/modules/handoff/cli/cli-main.js (parallelExecution early return ~L1158; chaining loop has no surrounding try/catch)',
  },
  {
    claim: "For LEAD-FINAL-APPROVAL specifically (this SD's own target handoff type), HANDOFF_POST_ACTION=ship prints AFTER HANDOFF_RESULT -- a naive 'reprint HANDOFF_RESULT alone, last' would orphan this directive on exactly the handoff type this SD exists to fix.",
    verified_by: 'VALIDATION (evidence 5348003b-106b-4271-b94d-2ca3dcf5a358)',
    verified_at: 'scripts/modules/handoff/cli/execution-helpers.js:396',
  },
];

(async () => {
  const { data: sd } = await supabase.from('strategic_directives_v2').select('metadata').eq('id', SD_ID).single();
  const existing = Array.isArray(sd.metadata?.mechanism_verifications) ? sd.metadata.mechanism_verifications : [];
  const metadata = {
    ...(sd.metadata || {}),
    mechanism_verifications: [...existing, ...round2_verifications],
    mechanism_verifications_round2_recorded_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('strategic_directives_v2').update({ metadata }).eq('id', SD_ID);
  if (error) throw new Error(`update failed: ${error.message}`);
  console.log(`Appended ${round2_verifications.length} round-2 mechanism_verifications; total now ${existing.length + round2_verifications.length}.`);
})();
