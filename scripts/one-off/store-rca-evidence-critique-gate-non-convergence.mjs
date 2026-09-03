import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-ONE-BELT-CENSUS-001';
const PHASE = 'LEAD-TO-PLAN';

// Persists the RCA findings from the rca-agent Task-tool call (agentId a9bb9a4501648a902,
// 2026-09-02T~23:57-00:10Z) that were reported to the worker as text output but never written to
// sub_agent_execution_results (the Agent-tool RCA invocation, unlike execute-subagent.js --code RCA,
// does not auto-persist). Written now so the finding has a durable, citable row for
// SD-LEO-INFRA-CRITIQUE-GATE-NON-001 to reference, per the coordinator_request asking where it lives.
const results = {
  verdict: 'FAIL',
  confidence: 93,
  classification: 'code_bug',
  category: 'protocol_process',
  summary:
    'PRE_PLAN_ADVERSARIAL_CRITIQUE is a fixed-quota ranking generator, not a measurement: 0 PASS ' +
    'verdicts in 371 all-time runs (plan_critiques table), block-findings flat at ~1.5/round from ' +
    'round 1 through round 19 with zero decay across genuine content fixes, and 0 escapes observed ' +
    'after round 4 in ~70 critiques fleet-wide. On THIS SD (SD-LEO-INFRA-ONE-BELT-CENSUS-001), 6 ' +
    'rounds of genuine substantive PRD fixes (undefined scope contract, incoherent result shape, ' +
    'bucketFor signature contradiction, a hand-guessed status-terminal set corrected against the ' +
    'live strategic_directives_v2_status_check/quick_fixes_status_check CHECK constraints via ' +
    'pg_constraint, an unresolvable coordinatorId dependency, ambiguous per-table scope wording) ' +
    'never reduced the block-finding count to zero.',
  root_cause:
    "The critic's prompt (lib/eva/devils-advocate.js:656) instructs a RANKING (\"Maximum 5 " +
    'findings — pick the most consequential\'), not a threshold, composed with max()-aggregation ' +
    'in the gate reader (scripts/modules/handoff/executors/lead-to-plan/gates/pre-plan-critique.js). ' +
    'A ranking operator is scale-invariant and never returns empty for any document. Per-finding ' +
    'block rate measured at ~32%, so P(>=1 block) is approximately 86% even on a flawless plan. The ' +
    'gate was promoted to verdict-bearing on a measurement (98% block rate, allegedly "never blocked ' +
    'a real handoff") that equally supports the opposite conclusion ("the critic is stuck-at-BLOCK") ' +
    '-- no negative control (golden-corpus known-good input) ever demonstrated the gate CAN pass. ' +
    'Statelessness (buildCritiqueUserPrompt receives only {prdContent, archContent, sdContext}, no ' +
    'memory of prior rounds\' fixes) is a real, secondary contributor to the round-over-round ' +
    'oscillation, but is not the load-bearing defect -- fixing statelessness alone would not move ' +
    'the ~86% base rate.',
  five_whys: [
    '1. Why does the gate keep blocking? Every round returns >=1 block-severity finding (2,1,1,1,2,2 across 6 rounds on this SD).',
    '2. Why is there always a block finding? The critic emits a fixed quota of 4-5 findings regardless of input quality, and the verdict is max() over them.',
    '3. Why a fixed quota? The prompt instructs a RANKING ("most consequential 5"), not a THRESHOLD. A ranking is never empty for any document.',
    '4. Why was a non-convergent instrument made verdict-bearing? The promotion rationale (217 rows, 213 BLOCK, none ever blocked a handoff) equally supports "the critic is ignored" and "the critic is stuck-at-BLOCK" -- no test distinguished them.',
    '5. ROOT CAUSE: A ranking-based LLM critic with no sufficiency rubric and no absolute severity anchor was promoted to blocking without a negative control -- no demonstration that any input can produce a non-blocking verdict.',
  ],
  fleet_wide_evidence: {
    plan_critiques_total_runs: 371,
    pass_verdicts_ever: 0,
    block_findings_per_round_trend: 'flat ~1.5 from round 1 through round 19, zero decay across genuine fixes',
    escape_rate_after_round_4: '0 in ~70 critiques',
    per_finding_block_rate_pct: 32,
    p_at_least_one_block_pct: 86,
    overrides_last_30_days: 21,
    overrides_of_160_total: 160,
    override_reasons_saying_critic_was_right_and_unfixable: 0,
  },
  capa_corrective: [
    { action: 'Re-inserted PRD with coordinatorId + per-table scope algorithm fixes; ran handoff once more (round 7); recorded an audited critique-override with per-finding FIXED/ACCEPTED-AS-RISK/REJECTED-WITH-REASON dispositions', file: 'scripts/temp/prd-one-belt-census-001.json', urgency: 'immediate', status: 'done' },
    { action: 'Filed /signal gate-bug with this finding, severity medium', file: 'worker-signal.cjs', urgency: 'immediate', status: 'done (signal_id c2b0f213-6935-400a-a2c2-7acfc3fb0fab)' },
  ],
  capa_preventive: [
    { control: "Replace the ranking instruction with an emission threshold ('emit a finding ONLY if it independently meets the bar; zero findings is the expected outcome for a well-specified plan')", location: 'lib/eva/devils-advocate.js:656', type: 'code_fix' },
    { control: "Anchor 'block' severity to decision-authority cost ('a defect PLAN cannot resolve without authority it lacks'), not to any unspecified-detail property; an unspecified detail PLAN can reasonably choose is warn, never block", location: 'lib/eva/devils-advocate.js:646-650', type: 'code_fix' },
    { control: 'Split by determinism: make the invariant-library half of the gate verdict-bearing (identical, stable across all 6 rounds on this SD) and the LLM half advisory', location: 'scripts/modules/handoff/executors/lead-to-plan/gates/pre-plan-critique.js:182-188', type: 'validation_gate' },
    { control: 'Require >=2 block-severity findings to fail the gate, removing the ~76% of blocks riding on exactly one nondeterministic finding', location: 'scripts/modules/handoff/executors/lead-to-plan/gates/pre-plan-critique.js:274', type: 'validation_gate' },
    { control: 'Round-count circuit breaker at N=4 returning a distinct GATE_NON_CONVERGENT verdict that names the override path explicitly', location: 'scripts/modules/handoff/executors/lead-to-plan/gates/pre-plan-critique.js validatePrePlanCritique', type: 'runtime_check' },
    { control: 'Add a golden-corpus (known-good input) negative-control test in CI -- no gate should be verdict-bearing until it has demonstrably passed at least once; today 0/371', type: 'validation_gate' },
    { control: 'Set LLM temperature to 0 (or best-of-3 majority vote on severity) -- the verdict currently turns on a full-temperature token choice between warn/score-75 and block/score-0', location: 'lib/eva/devils-advocate.js:606', type: 'code_fix' },
    { control: 'Give critique-override.js a structured disposition enum (verified_false | exhaustion | accepted_risk) so critique-catch-rate-monitor.js gets a false-positive channel -- today it has none: blocks_sustained = blocks - overrides assumes every non-overridden block is a true positive by construction', location: 'scripts/critique-override.js + scripts/critique-catch-rate-monitor.js', type: 'runtime_check' },
  ],
  experts_consulted: [
    { expert: 'validation-agent', summary: 'Ranking-composed-with-max is the primary defect; statelessness is second-order. Corrected an early oscillation misread: the round-5/6 disagreement over the lane-scope extraction was note-vs-warn (both non-blocking); round 6\'s two actual blocks were substantively correct API gaps. Identified the content_hash override-sequencing trap (override binds to the row whose hash matches the CURRENT DB content, not the row that produced it).' },
    { expert: 'testing-agent', summary: 'The gate\'s own promotion rationale (98% block rate, "never blocked a real handoff") equally supports the opposite reading and no test ever distinguished them; the invariant library is a naturally-occurring control group proving the LLM half specifically fails test-retest, not the gate design overall; read all 21 recent override reasons and found zero claiming the critic was correct and unfixable.' },
  ],
  execution_time_ms: 932902,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'RCA',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('RCA', SD_ID, { name: 'Gate Non-Convergence RCA (rca-agent, agentId a9bb9a4501648a902)' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
