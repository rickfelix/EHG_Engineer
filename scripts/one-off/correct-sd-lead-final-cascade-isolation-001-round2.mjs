import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID = '86a0cc7f-169e-407a-8905-0d103f40b801';

// VALIDATION (evidence 5348003b-106b-4271-b94d-2ca3dcf5a358) found two round-1 gaps, both
// independently re-verified by direct grep before writing this correction:
//   CRITICAL 1: round-1's "fixing the ONE shared picker closes BOTH call sites" was FALSE. There
//   is a THIRD, PRIMARY cascade path: executeAutoChain (hook:1115) -> selectNextSD
//   (scripts/modules/handoff/queue-selector.js:33), reached whenever a session context exists.
//   findNextAvailableOrchestrator only runs on the EXIT_NO_SESSION fallback. selectNextSD's own
//   .select('id, sd_key, title, status, priority, parent_sd_id, category, current_phase') has
//   ZERO eligibility-relevant columns and ZERO calls to classifyDispatchIneligibility (grep
//   confirmed). Round 1's fix would have left the PRIMARY path -- plausibly the one that produced
//   the 3 real specimens -- completely open.
//   CRITICAL 2: even findNextAvailableOrchestrator's OWN select
//   ('id, sd_key, title, status, priority, parent_sd_id') omits metadata -- so wiring
//   classifyDispatchIneligibility in as-is would read row.metadata.requires_human_action as
//   undefined, fail open, and block nothing. A guard that runs but cannot observe its subject.
//   Also corrected: round 1's own citation of "scripts/modules/handoff/cli/orchestrator-completion-hook.js"
//   is wrong -- no cli/ subdirectory exists; the real path is
//   scripts/modules/handoff/orchestrator-completion-hook.js:153-210 (grep-confirmed: ls fails on
//   the cli/ path, succeeds on the corrected one).
const key_changes = [
  {
    change: "BOTH pickers get the fix, not one: selectNextSD (scripts/modules/handoff/queue-selector.js:33, the PRIMARY path via executeAutoChain, reached whenever a session context exists) AND findNextAvailableOrchestrator (scripts/modules/handoff/orchestrator-completion-hook.js:153-210, the FALLBACK path reached only on EXIT_NO_SESSION). Each widens its .select() to include metadata (required for classifyDispatchIneligibility's requires_human_action check to see anything at all) and calls classifyDispatchIneligibility(candidateRow, ctx) per candidate, skipping ineligible ones. classifyDispatchIneligibility is pure/sync/DB-free (VALIDATION-confirmed), so this costs a widened select list, not a second round-trip.",
    impact: "Closes the cascade at its actual primary entry point, not just the fallback -- round 1's fix would have left the more-frequently-taken path (and plausibly the one that produced all 3 real specimens) completely unguarded.",
  },
  {
    change: "cli-main.js's cache-before/reprint-after shape is wrapped in try/finally, not a bare cache+reprint: the parallelExecution early return (~L1158) exits before any post-loop code runs today, and there is no try/catch anywhere in the chaining loop, so a thrown exception also skips the reprint. try/finally guarantees the cached original result reprints on every exit path (normal loop completion, the parallelExecution early-return, and a thrown exception).",
    impact: "The false-failure-signal fix (round 1's key_changes #2) actually holds under the real control-flow shapes this loop has today, not just the happy path.",
  },
  {
    change: "The reprint for LEAD-FINAL-APPROVAL specifically preserves BOTH the original SD's HANDOFF_RESULT line AND its HANDOFF_POST_ACTION=ship line (execution-helpers.js:396, printed AFTER HANDOFF_RESULT) in their original relative order -- a naive 'reprint HANDOFF_RESULT alone, last' would bury/orphan the ship directive on exactly this SD's own target handoff type.",
    impact: "Avoids trading one last-line defect (wrong-SD FAIL) for a new one (a real, needed post-action directive silently disappearing from the tail of the log) on the handoff type this SD exists to fix.",
  },
  {
    change: 'Test fixtures now cover THREE paths, not two: (a) executeAutoChain/selectNextSD sessionful primary path with a requires_human_action=TRUE candidate -- asserts no attempt AND the candidate is excluded because metadata was actually selected and read; (b) findNextAvailableOrchestrator EXIT_NO_SESSION fallback path, same assertion shape; (c) a forced throw (or the parallelExecution early-return) proving the reprint still fires via try/finally, and specifically for LEAD-FINAL-APPROVAL, proving HANDOFF_POST_ACTION=ship is not orphaned.',
    impact: 'Directly reproduces and pins closed both VALIDATION-found gaps, not just the round-1 premise.',
  },
  {
    change: 'PLAN-phase carries forward an open question VALIDATION raised: determine (from the 3 historical specimens -- feedback 984b348c/7585d6c8/7b4e5e86 -- or from session-context logs at the time) which picker actually fired each time, sessionful (selectNextSD) or fallback (findNextAvailableOrchestrator). Not required to close this SD (both pickers get fixed regardless), but worth recording for prioritization and for confirming the fix would actually have prevented the historical specimens.',
    impact: 'Turns an open validation question into an explicit, non-blocking PLAN-phase investigation item rather than leaving it implicit.',
  },
];

const estimated_loc_basis = 'round 2 (VALIDATION-corrected): two pickers in two files each need a widened select (~5 LOC each) + an eligibility call (~10 LOC each) + dedicated fixtures (~25 LOC each); reprint try/finally + HANDOFF_POST_ACTION-ordering fix ~20 LOC + its own fixture ~15 LOC; delimiting the cascade log block ~15 LOC. Total ~150-200, not the round-1 estimate of ~110 (which assumed one picker, one call site).';

(async () => {
  const { data: sd } = await supabase.from('strategic_directives_v2').select('metadata').eq('id', SD_ID).single();
  const metadata = {
    ...(sd.metadata || {}),
    estimated_loc: 180,
    estimated_loc_basis,
  };
  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ key_changes, metadata })
    .eq('id', SD_ID);
  if (error) throw new Error(`update failed: ${error.message}`);
  console.log('SD key_changes corrected per VALIDATION round-2 findings; estimated_loc updated to 180.');
})();
