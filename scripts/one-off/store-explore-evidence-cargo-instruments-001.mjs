// SD-LEO-INFRA-MINUS-CARGO-INSTRUMENTS-001 — Explore sub-agent evidence writer (LEAD phase).
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-MINUS-CARGO-INSTRUMENTS-001';
const PHASE = 'LEAD';

const results = {
  verdict: 'PASS',
  confidence: 90,
  summary:
    'Explored the full thesis-kill-gate implementation surface: lib/eva/lifecycle/thesis-kill-evaluator.js ' +
    '(evaluateThesisKillCriteria() at line 86; defaultResolveObservedValue() at line 29 is a permanent no-op ' +
    'returning undefined -- inputs structurally unwired; toStrictObservedValue() at line 70 correctly coerces ' +
    'non-finite values to undefined; classifyVerdict() at line 42 maps unobservable:true to HOLD); ' +
    'lib/eva/lifecycle/thesis-kill-gate.js (checkThesisKillGate() at line 129 wraps the whole evaluateThesisKillCriteria ' +
    'call in one try/catch that fails OPEN on any throw, returning {allowed:true, fired:[], held:[]} with zero ' +
    'system_events emitted; logThesisKillEvent() at line 56 writes only to system_events, never calls recordGateAttempt); ' +
    'lib/eva/artifact-persistence-service.js (recordGateAttempt() at line 458, already built, accepts resolvedOutcome ' +
    'including cannot_evaluate explicitly, wraps open_eva_gate_attempt()/finalize_eva_gate_attempt() RPCs; header ' +
    'comment already documents eva_stage_gate_attempts as chairman-gated and not yet applied live -- confirmed via a ' +
    'live PostgREST PGRST205 on the table and PGRST202 on both RPCs); lib/agents/modules/venture-state-machine/' +
    'stage-gates.js (hardcoded KILL_GATE_STAGES={3,5,13,24} -- confirmed stale against the canonical venture_stages ' +
    'gate_type=kill set {3,5,13,23}, being replaced by SD-LEO-INFRA-MINUS-GATE-SSOT-001/P2 via lib/eva/stage-governance.js, ' +
    'already merged to main via PR #7460); lib/eva/corrective-finding-recorder.js (recordCorrectiveFinding() at line 75, ' +
    'category=corrective_finding hardcoded at two sites -- insert L134 and dedup lookup L110 -- 36 live rows, not safely ' +
    'extensible for a new factory_defect category; only the exported computeDedupHash helper is reusable); ' +
    'lib/eva/stage-zero/thesis-contract.js (validateKillCriteria(), evaluateKillCriterion(), deriveDefaultKillCriteria() ' +
    'with its own hardcoded stage_by defaults {12,16,24} -- a third, disjoint stage-set vocabulary from both the gate-type ' +
    'set and any per-venture armed set); database/chairman-gated/20260823_eva_stage_gate_attempts.sql (the not-yet-applied ' +
    'migration, freeze trigger, esga_passed_matches_outcome constraint). Live AltifyAI venture (id=50763b6a-1fad-4e1e-b2fc-' +
    '296a1d66ebf9, current_lifecycle_stage=19) directly queried: metadata.kill_criteria holds exactly 3 entries, all ' +
    'stage_by=21 (kill-demand-conversion/demand_test_conversion_rate/lt 2, kill-willingness-to-pay/card_verified_preorders/' +
    'lt 1, kill-economics-ltv-cac/ltv_cac_ratio/lt 3), plus metadata.demand_test_plan.floors documenting a free-text-only ' +
    'sample floor (visitors_min:300) and an honest_gauge_rule stating a floor-unmet reading must render NO-DATA, never a verdict.',
  findings: [
    { id: 'resolver-permanent-noop', severity: 'critical', note: 'thesis-kill-evaluator.js:29 defaultResolveObservedValue() always returns undefined -- K1-K3 are armed conceptually on live ventures but structurally unmeasurable today. This is the SDs core defect (FR-1 target).' },
    { id: 'gate-wrapper-fail-open', severity: 'critical', note: 'thesis-kill-gate.js checkThesisKillGate() wraps the ENTIRE evaluation loop in one try/catch; a throwing resolver silently discards verdicts for ALL criteria on a venture, returns allowed:true, and emits zero system_events. In binding mode this is a kill-bypass, not just a robustness gap (FR-3 target, confirmed independently by risk-agent as R2).' },
    { id: 'three-stage-set-vocabularies', severity: 'warning', note: 'Three disjoint kill-stage vocabularies coexist: venture_stages gate_type=kill = {3,5,13,23} (canonical, via new stage-governance.js SSOT); thesis-contract.js deriveDefaultKillCriteria hardcodes stage_by defaults {12,16,24}; AltifyAIs actual armed set is {21,21,21}. stage_by is a per-criterion due-date, NOT membership in the gate-type kill-stage set -- conflating them in FR-4 would silently disarm all 3 of AltifyAIs live criteria.' },
    { id: 'eva-stage-gate-attempts-not-live', severity: 'warning', note: 'Confirmed via direct live PostgREST call: table public.eva_stage_gate_attempts does not exist (PGRST205); open_eva_gate_attempt/finalize_eva_gate_attempt RPCs also absent (PGRST202). Migration sits chairman-gated at database/chairman-gated/20260823_eva_stage_gate_attempts.sql, not yet applied. FR-6s live demonstration must be scoped to the DDL/ephemeral-DB test tier.' },
    { id: 'corrective-finding-recorder-not-reusable', severity: 'info', note: 'lib/eva/corrective-finding-recorder.js hardcodes category=corrective_finding at both its insert (L134) and its dedup SELECT (L110); 36 live rows confirm it is an active, load-bearing writer, not dead code. A new factory_defect category needs a sibling writer reusing only computeDedupHash, not an extension of this one.' },
    { id: 'floor-only-in-prose', severity: 'warning', note: 'AltifyAIs metadata.demand_test_plan.floors (visitors_min:300, honest_gauge_rule text) is the only place a sample-floor requirement is expressed, and it is free-text prose with no machine-readable field. A naive FR-1 resolver computing a finite conversion rate from a below-floor sample would incorrectly satisfy toStrictObservedValue and could fire a kill the ratified text explicitly forbids.' },
  ],
  metadata: {
    resolver_noop_line: 'thesis-kill-evaluator.js:29',
    gate_wrapper_catch_scope: 'whole-loop (thesis-kill-gate.js checkThesisKillGate)',
    eva_stage_gate_attempts_live: false,
    altifyai_venture_id: '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9',
    altifyai_current_stage: 19,
    altifyai_kill_criteria_stage_by: [21, 21, 21],
    canonical_kill_stages: [3, 5, 13, 23],
    corrective_finding_live_row_count: 36,
  },
  execution_time_ms: 420000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'Explore',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('Explore', SD_ID, { name: 'Explore Discovery Agent' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
console.log('STORED_SD_ID=' + (stored?.sd_id || 'n/a'));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
