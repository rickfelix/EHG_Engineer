import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID = '86a0cc7f-169e-407a-8905-0d103f40b801';

// LEAD-phase trace (fork investigation) corrected two premises in the proposal-authored scope:
// (a) the trigger site is NOT sd-workflow.js:77 (that only console.logs a recommendation for the
//     SAME SD) -- it is cli-main.js:1101-1128's "STANDALONE SD CHAINING", which genuinely EXECUTES
//     handleExecuteCommand('LEAD-TO-PLAN', ...) on a DIFFERENT SD when chain_orchestrators is on.
// (b) there is a SECOND, previously-unnamed cascade path sharing the SAME unguarded picker:
//     orchestrator-completion-hook.js's legacy fallback (~L1125-1144, reached on EXIT_NO_SESSION).
//     Both call findNextAvailableOrchestrator (orchestrator-completion-hook.js:175-182), which
//     filters ONLY on status/parent_sd_id/live-claim -- it never imports or calls
//     classifyDispatchIneligibility (lib/fleet/claim-eligibility.cjs) and never checks
//     requires_human_action. Fixing the ONE shared picker closes BOTH call sites.
// (c) the prior "claimed fix" (coordinator reply 9cb22c86) is real and landed -- a claimed-SD
//     concurrency filter at orchestrator-completion-hook.js:158-169/199-203 -- but it answers a
//     DIFFERENT question ("is another session already on this") than the one that recurred
//     ("is this SD allowed to be touched by anyone"). That is why the recurrence happened without
//     needing a separate regression commit to explain it.
const key_changes = [
  {
    change: 'findNextAvailableOrchestrator (scripts/modules/handoff/cli/orchestrator-completion-hook.js:175-182) calls classifyDispatchIneligibility (lib/fleet/claim-eligibility.cjs) before returning a candidate SD, refusing any requires_human_action=TRUE / fenced / deferred SD -- fixing the ONE shared picker closes BOTH known cascade call sites at once: the standalone-chaining path (cli-main.js:1101-1128) and the orchestrator-hook legacy fallback (~L1125-1144, EXIT_NO_SESSION), rather than patching each call site separately.',
    impact: 'A human-fenced SD (e.g. BIND-OBSERVE-ONLY-001, requires_human_action=TRUE since 2026-07-28) can never again be auto-cascaded into by either path -- closes the exact defect class that produced 3 specimens in one day.',
  },
  {
    change: "cli-main.js caches the ORIGINAL SD's handoff result (currentResult) before entering the standalone-chaining while loop, and unconditionally re-prints it in the SAME format execution-helpers.js already uses (HANDOFF_RESULT=... SD=... SCORE=... PHASE=...) as the LAST line of stdout after the loop exits or breaks -- regardless of whether a cascade attempt happened, and regardless of that cascade's own result.",
    impact: "A worker or log-tailer trusting the last stdout line always sees the SD that was actually just completed, never an unrelated cascaded SD's result -- closes the false-failure-signal defect that plausibly contributed to at least one fleet worker exiting its loop at completion (harness_backlog 72b66de9).",
  },
  {
    change: 'The cascade attempt itself becomes a clearly delimited, separately-logged step (own header/log block, e.g. "=== AUTO-CHAIN: attempting <SD> ===") rather than interleaving with the original SD\'s own result output. Kept (not dropped) because the fork trace confirmed chain_orchestrators is live, on-by-default production behavior with a real call site depended on today -- dropping it would be a larger, undocumented behavior change outside this SD\'s DOES-NOT boundary ("does not change LEAD-FINAL gate semantics").',
    impact: 'Makes the two steps (original SD completion vs. opportunistic next-SD attempt) visually and structurally distinguishable in stdout/logs, without removing the chaining capability worker sessions rely on.',
  },
  {
    change: 'Regression test pinning the exact specimen shape: a fixture where a standalone SD completes LEAD-FINAL-APPROVAL successfully and findNextAvailableOrchestrator\'s only candidate is requires_human_action=TRUE -- asserts NO LEAD-TO-PLAN attempt is made on the fenced candidate, and asserts the ORIGINAL SD\'s PASS is the literal last line of output. A second fixture covers the orchestrator-hook legacy fallback path with the same fenced-candidate shape, proving the shared-picker fix closes both call sites.',
    impact: 'Directly reproduces and pins closed the 3-specimen defect (feedback 984b348c / 7585d6c8 / 7b4e5e86) and the earlier incomplete fix (coordinator reply 9cb22c86) that only closed a concurrency gap, not the eligibility gap.',
  },
];

const description = `DOES: (1) findNextAvailableOrchestrator (orchestrator-completion-hook.js:175-182) calls classifyDispatchIneligibility before returning a candidate -- refusing requires_human_action/fenced/deferred SDs, closing BOTH cascade call sites (cli-main.js standalone chaining L1101-1128, AND orchestrator-completion-hook.js legacy fallback ~L1125-1144) via the one shared picker; (2) cli-main.js caches the original SD's handoff result before the chaining loop and unconditionally re-prints it as the literal last stdout line after the loop exits/breaks; (3) the cascade attempt becomes a clearly delimited, separately-logged step (kept, not dropped -- chain_orchestrators is live production behavior); (4) two regression fixtures (standalone-chaining path + orchestrator-hook legacy-fallback path) each proving a fenced candidate is never attempted and the original SD's result is always the last line. DOES NOT: change LEAD-FINAL gate semantics; touch worker /loop directive. CORRECTED FROM PROPOSAL: the original scope cited sd-workflow.js:77 as the trigger site -- LEAD-phase trace found that function only logs a recommendation for the SAME SD and never triggers anything; the real trigger is cli-main.js's standalone SD chaining logic, and a second, previously-unnamed cascade path sharing the same unguarded picker was also found.`;

(async () => {
  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ key_changes, description, scope: description })
    .eq('id', SD_ID);
  if (error) throw new Error(`update failed: ${error.message}`);
  console.log('SD key_changes/description/scope corrected per LEAD-phase trace.');
})();
