import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID = '86a0cc7f-169e-407a-8905-0d103f40b801';
const VERIFIED_BY = 'LEAD (direct trace via forked investigation)';

const mechanism_verifications = [
  {
    claim: "findNextAvailableOrchestrator filters only on status/parent_sd_id/live-claim; never imports or calls classifyDispatchIneligibility; never checks requires_human_action. Also contains a SECOND cascade path (legacy fallback) sharing the same picker.",
    verified_by: VERIFIED_BY,
    verified_at: 'scripts/modules/handoff/cli/orchestrator-completion-hook.js:175-182,1125-1144',
  },
  {
    claim: "STANDALONE SD CHAINING logic genuinely executes handleExecuteCommand('LEAD-TO-PLAN', nextSD.id, args) on a DIFFERENT SD when chain_orchestrators is enabled, then continues the while loop -- this is the real trigger site, not sd-workflow.js as the original proposal cited.",
    verified_by: VERIFIED_BY,
    verified_at: 'scripts/modules/handoff/cli/cli-main.js:1101-1128',
  },
  {
    claim: "displayWorkflowRecommendation only console.logs 'SD WORKFLOW RECOMMENDATION' for the SAME SD passed in -- it never triggers a handoff attempt on another SD. The original proposal's citation of this as the trigger site was WRONG; corrected during LEAD trace.",
    verified_by: VERIFIED_BY,
    verified_at: 'scripts/modules/handoff/cli/sd-workflow.js:77',
  },
  {
    claim: 'Entry point that dispatches into cli-main.js; contains no cascade-triggering logic itself (the cascade lives downstream in cli-main.js).',
    verified_by: VERIFIED_BY,
    verified_at: 'scripts/handoff.js (confirmed no cascade logic at this layer)',
  },
  {
    claim: "Confirmed no cascade-triggering logic at this layer; part of the CLI dispatch chain the original proposal cited but not where the cascade actually fires.",
    verified_by: VERIFIED_BY,
    verified_at: 'scripts/modules/handoff/cli/index.js (confirmed no cascade logic at this layer)',
  },
  {
    claim: "Confirmed no cascade-triggering logic at this layer either -- the proposal's originally-cited call chain (handoff.js -> cli/index.js -> completion-verification.js -> sd-workflow.js) does not reach the actual trigger, which lives in cli-main.js instead.",
    verified_by: VERIFIED_BY,
    verified_at: 'scripts/modules/handoff/cli/completion-verification.js (confirmed no cascade logic at this layer)',
  },
  {
    claim: 'Exports classifyDispatchIneligibility, the canonical eligibility check the SD scope names as required for any picker; confirmed NOT imported or called anywhere in orchestrator-completion-hook.js today (zero references, grep-confirmed).',
    verified_by: VERIFIED_BY,
    verified_at: 'lib/fleet/claim-eligibility.cjs (classifyDispatchIneligibility export); zero references in orchestrator-completion-hook.js',
  },
  {
    claim: "Prints the terminal HANDOFF_RESULT=... line inside handleExecuteCommand -- the exact insertion point success_criteria #1 depends on: the original SD's result must be cached before the chaining loop and re-printed via this same format after it exits.",
    verified_by: VERIFIED_BY,
    verified_at: 'scripts/modules/handoff/cli/execution-helpers.js:384,430',
  },
  {
    claim: "The prior claimed fix (coordinator reply 9cb22c86, 'two recommendations + a claim-eligibility check adopted') is real and landed as a claimed-SD CONCURRENCY filter -- but it answers a different question ('is another session already on this') than the one that recurred ('is this SD allowed to be touched by anyone'), which is why requires_human_action was never addressed and the defect recurred without needing a separate regression commit to explain it.",
    verified_by: VERIFIED_BY,
    verified_at: 'scripts/modules/handoff/cli/orchestrator-completion-hook.js:158-169,199-203',
  },
];

(async () => {
  const { data: sd } = await supabase.from('strategic_directives_v2').select('metadata').eq('id', SD_ID).single();
  const metadata = {
    ...(sd.metadata || {}),
    mechanism_verifications,
    mechanism_verifications_recorded_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('strategic_directives_v2').update({ metadata }).eq('id', SD_ID);
  if (error) throw new Error(`update failed: ${error.message}`);
  console.log(`Recorded ${mechanism_verifications.length} mechanism_verifications.`);
})();
