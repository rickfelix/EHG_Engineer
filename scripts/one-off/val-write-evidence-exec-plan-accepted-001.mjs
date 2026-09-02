import 'dotenv/config';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001';
const supabase = await getSupabaseClient();

const summary = [
  'CONDITIONAL_PASS. The defect is real and current: a bypassed handoff (handoff.js execute EXEC-TO-PLAN --bypass-validation)',
  'is byte-identical, on every row downstream gates/roles read, to a genuinely validated one. But the ticket\'s root-cause',
  'narrative is wrong in two places. Part 1 (weighted-scoring-overrides-veto) is built against a bug that does not exist:',
  'ValidationOrchestrator.js:377 sets passed=false + earlyExit=true on any required failure; the weighted-threshold block at',
  ':491-522 is guarded by if(results.passed && ...) on both entry conditions, so it can only downgrade a pass, never upgrade',
  'a fail. HandoffOrchestrator.js:723-816 is not a second accept path either -- it is the explainGates dry-run preview',
  '(display-only, never consulted for acceptance). The ACTUAL single choke point is BaseExecutor.js ~641-649 (and a second,',
  'narrower instance at ~348): under options.bypassValidation, a gate failure is logged to stdout and falls straight through',
  'into the success return WITHOUT mutating the result object, so gateResults.passed===false never reaches the recorder.',
  'Part 3 (bypass provenance stamping) is correctly targeted and is the highest-value part of the ticket, with one correction:',
  'the sd_id-NULL bug is not in the bypass_ledger insert (cli-main.js already discriminates UUID vs sd_key correctly for that',
  'table) -- it is the paired validation_audit_log emission, which has no sd_key column/fallback at all, so a key-invoked',
  'bypass writes an unlinked audit row. Part 4 (canonical uncomplete path) targets the wrong table: reactivate-sd.js writes',
  'sd_transition_audit, not audit_log; its status guard is WHERE status=\'deferred\', with TERMINAL_STATUSES used only to',
  'decorate the refusal message, not as an independent lock; metadata.completion_evidence_invalid has zero existing',
  'writers/readers today and must be fully specified by PLAN or the reopen path is dead on arrival. Part 2 (advisory verdict',
  'never converts a BLOCKED required verdict into a pass) is real -- subagent-evidence-gate.js:621-630 confirms advisory mode',
  'returns passed:true score:100 even for a BLOCKED verdict -- but its blast radius is fleet-wide (an in-code comment measures',
  '32/313 SDs affected) and should be split into a narrowly-scoped change or a follow-up SD rather than bundled at the same',
  'risk tier as the completion-integrity fix.',
].join(' ');

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 85,
  summary,
  findings: [
    {
      id: 'R1',
      severity: 'high',
      title: 'Ticket Part 1 (weighted scoring overrides the required-gate veto) is built on a false premise',
      detail: 'ValidationOrchestrator.js:377 (`if (!passed && required !== false && !isSkipped)`) and the batch precheck at :1224 both set results.passed=false unconditionally on a required failure. The weighted-threshold block at :491-522 is gated by `if (results.passed && ...)` on both branches -- it can only downgrade an existing pass to a lower score, never upgrade a failing required gate to a pass. There is no route where weighting overrides the veto as the ticket describes.',
      evidence: 'scripts/modules/handoff/validation/ValidationOrchestrator.js:377, :470-522, :1224',
    },
    {
      id: 'R2',
      severity: 'high',
      title: 'Ticket cites HandoffOrchestrator.js:723-816 as a second accept path -- it is a dry-run preview, never consulted for acceptance',
      detail: 'That block is the explainGates() dry-run path, gated by options.evaluate and explicitly logged as "dry-run, no writes". Its wouldPass = gateResults.passed && aggregateScore >= gateThreshold (line ~843) is display-only. Fixing it changes nothing about real acceptance.',
      evidence: 'scripts/modules/handoff/executors/BaseExecutor.js / HandoffOrchestrator explainGates block, ~723-843',
    },
    {
      id: 'R3',
      severity: 'critical',
      title: 'The real, single choke point: BaseExecutor.js bypass fall-through never stamps the result',
      detail: 'Under options.bypassValidation with !gateResults.passed, the executor logs "BYPASS ACTIVE: Gate failures overridden" and continues into executeSpecific() and the success return WITHOUT setting a bypassed flag or otherwise mutating the returned result. gateResults.passed=false is computed but silently dropped. A second, narrower bypass exists at the same file around line 348 (authority-fence bypass) with the identical no-mark shape. This is the fix location Parts 1/2 of the ticket should have named instead.',
      evidence: 'scripts/modules/handoff/executors/BaseExecutor.js:348, :641-649, :820-830 (return shape has no bypassed key)',
    },
    {
      id: 'R4',
      severity: 'medium',
      title: 'Even where a gate stamps its own bypassed:true, HandoffRecorder.js drops it on the floor',
      detail: 'plan-to-exec/index.js:384-455 correctly stamps { success:true, bypassed:true } and spreads it into the returned result. But HandoffRecorder.recordSuccess() hardcodes validation_passed:true on leo_handoff_executions (never reads result.bypassed), and the sd_phase_handoffs insert uses validation_passed: result.success !== false -- also ignoring result.bypassed. The fix must land in BaseExecutor (stamp) AND HandoffRecorder (read + persist the stamp), not BaseExecutor alone, or a correctly-stamped bypass from other executors (grill-convergence.js, activation-invariant-gate.js, integration-contract-gate.js) will still be recorded as an unqualified pass.',
      evidence: 'scripts/modules/handoff/recording/HandoffRecorder.js ~235-251 (recordSuccess), ~1002-1018 (sd_phase_handoffs insert); scripts/modules/handoff/executors/plan-to-exec/index.js:384-455',
    },
    {
      id: 'R5',
      severity: 'medium',
      title: 'The sd_id-NULL bug is misdiagnosed: bypass_ledger is fine, validation_audit_log is the orphan',
      detail: 'cli-main.js:751-790 already resolves UUID-vs-sd_key correctly before the bypass_ledger insert (that table has both sd_id and sd_key columns plus an index on sd_key). The actual gap is the paired emitValidationAuditLog call at ~cli-main.js:785: validation_audit_log has NO sd_key column at all, so a key-invoked bypass (the common case -- operators pass the human-readable SD key) writes an audit row with sd_id=NULL and zero SD linkage.',
      evidence: 'scripts/modules/handoff/cli/cli-main.js:751-790; database/migrations/20260516130001_add_bypass_ledger.sql; validation_audit_log schema (no sd_key column)',
    },
    {
      id: 'R6',
      severity: 'medium',
      title: 'Ticket Part 4 (canonical uncomplete path) names the wrong table and an unspecified new field',
      detail: 'scripts/reactivate-sd.js writes sd_transition_audit (transition_type=REACTIVATE), never audit_log -- audit_log does not appear anywhere in that file. computeReactivation refuses purely on sd.status !== \'deferred\'; TERMINAL_STATUSES only decorates the error message, it is not an independent enforcement lock (VALID_REACTIVATION_TARGETS already includes "active"). metadata.completion_evidence_invalid, which the reopen guard is supposed to key on, has zero existing writers or readers anywhere in the codebase today -- PLAN must specify exactly who sets this flag and when, or the guarded reopen path is unreachable by construction (dead by construction, not merely undocumented).',
      evidence: 'scripts/reactivate-sd.js (full read): computeReactivation ~47-70, VALID_REACTIVATION_TARGETS:36, TERMINAL_STATUSES:38, buildReactivationAudit ~76-92, sd_transition_audit write ~205-218',
    },
    {
      id: 'R7',
      severity: 'medium',
      title: 'Part 2 blast radius is fleet-wide (32/313 SDs), not scoped to the incident\'s bugfix-SD path',
      detail: 'subagent-evidence-gate.js resolveSubagentVerdictMode() defaults to \'advisory\' for EVERY SD (env SUBAGENT_VERDICT_MODE must equal exactly \'block\' to change this), not only bugfix SDs as the ticket implies. In advisory mode a BLOCKED verdict returns passed:true, score:100 (~line 621-630). An in-code comment near line 560 already measures this affects 32/313 SDs. Flipping this default (or even narrowing it) needs the same cutoff-aware, fail-open rollout shape already used elsewhere in this codebase (ACTIVATION_EVIDENCE_MODE / invocation-path-gate.js:59-84), not a flat toggle, or it risks mass-failing in-flight SDs on day one.',
      evidence: 'scripts/modules/handoff/gates/subagent-evidence-gate.js:117,143,153 (resolveSubagentVerdictMode), ~538-560, ~621-630; scripts/modules/handoff/executors/lead-final-approval/gates/invocation-path-gate.js:48-84 (precedent rollout pattern)',
    },
    {
      id: 'R8',
      severity: 'low',
      title: 'SD-LEO-FEAT-TRANSLATION-FIDELITY-GATES-001-A (dedup_match_sd_key) is not a true duplicate',
      detail: 'That field is purely an intake-pipeline textual-similarity dedup marker (scripts/intake/drain-intake.mjs, scripts/sourcing-engine/proactive-populator.mjs), unrelated to handoff/bypass code. The only production code under that SD family (scripts/eva/translation-fidelity-gate.js) checks EVA artifact fidelity (brainstorm-to-vision, vision-to-architecture, architecture-to-sd), orthogonal to EXEC-TO-PLAN handoff completion integrity. The keyword match ("gates") is coincidental.',
      evidence: 'scripts/eva/translation-fidelity-gate.js; scripts/intake/drain-intake.mjs:251,347',
    },
  ],
  warnings: [
    'HandoffRecorder.recordSuccess() also writes leo_handoff_executions with validation_passed hardcoded true -- confirm the PRD scopes a fix to BOTH persisted rows (leo_handoff_executions AND sd_phase_handoffs), not just one, or a false pass survives in the row other consumers may read.',
    'gates/learning-or-bypass-resolved-gate.js is the ONLY existing per-SD-scoped bypass-aware gate in LEAD-FINAL-APPROVAL today, but it reads validation_audit_log filtered on validator_name IN (bypass_rubric, bypass_shape) -- not the sd_phase_handoffs.bypass stamp this SD introduces, and it is warn-only by default (ENFORCE_LEARNING_GATE=false). PLAN should decide whether to extend this existing gate or add a new one; extending risks conflating two different bypass-detection mechanisms in one gate function.',
    'gate_results on handoff row 1a1b3087 may only be a summary, not the full 45-gate detail (HandoffRecorder stores a summary "to prevent bloat" per an in-code comment) -- confirm the Part-5 regression fixture is reconstructable before PLAN commits to it as a literal DB-sourced fixture.',
  ],
  recommendations: [
    'Re-scope Part 1: replace "fix the weighted-override bug" (does not exist) with "BaseExecutor.js must stamp bypassed:true on the result whenever it falls through a gate failure under options.bypassValidation, at both the ~348 and ~641-649 sites".',
    'Keep Part 3 as the spine of this SD, corrected: target cli-main.js\'s emitValidationAuditLog call (add sd_key linkage or resolve to UUID before that call too), add score_source:"bypassed" to HandoffRecorder.js\'s scoreSource computation, and add a per-SD sd_phase_handoffs.metadata.bypass read to PLAN-TO-LEAD and LEAD-FINAL-APPROVAL before allowing completion.',
    'Split Part 2 out of this SD\'s Tier-3 risk envelope: either a narrow rewording ("advisory may soften MISSING evidence, never a BLOCKED/failing required verdict") scoped tightly enough not to touch the fleet-wide default, or a separate follow-up SD using the invocation-path-gate.js cutoff-aware rollout pattern.',
    'Rewrite Part 4 against the real schema: sd_transition_audit (not audit_log), and have the PRD explicitly define who/what sets metadata.completion_evidence_invalid=true (a new writer this SD must also build) before specifying the reopen consumer of that flag.',
    'Confirm the 1a1b3087 gate_results fixture is fully reconstructable from persisted data before committing the Part-5 test to a literal DB row rather than a hand-built equivalent fixture.',
  ],
  validation_mode: 'prospective',
  metadata: {
    recorded_by: 'validation-agent (Task tool dispatch)',
    assessment_type: 'lead_phase_due_diligence',
    sd_key: SD_KEY,
    independently_reproduced: [
      'ValidationOrchestrator.js:377/:1224 required-failure veto confirmed unconditional; :470-522 weighted block confirmed gated on results.passed already true',
      'HandoffOrchestrator explainGates dry-run path confirmed display-only, not an acceptance route',
      'BaseExecutor.js bypass fall-through at ~348 and ~641-649/~820-830 confirmed: no bypassed flag set on the returned result in either case',
      'HandoffRecorder.js recordSuccess() confirmed hardcodes validation_passed:true; sd_phase_handoffs insert confirmed uses result.success!==false only',
      'plan-to-exec/index.js:384-455 confirmed it DOES stamp bypassed:true correctly -- and confirmed the recorder still drops it',
      'cli-main.js:751-790 confirmed correct UUID/sd_key discrimination for bypass_ledger; validation_audit_log schema confirmed has no sd_key column',
      'scripts/reactivate-sd.js read in full: writes sd_transition_audit, guard is status===\'deferred\', TERMINAL_STATUSES is message-only',
      'subagent-evidence-gate.js resolveSubagentVerdictMode() confirmed default advisory for all SDs, not bugfix-scoped; BLOCKED-verdict-passes-in-advisory-mode confirmed at ~621-630',
      'SD-LEO-FEAT-TRANSLATION-FIDELITY-GATES-001-A dedup match confirmed coincidental (intake keyword dedup, unrelated production code path)',
    ],
    gates_assessed: {
      lead_scope_readiness: 'CONDITIONAL_PASS -- buildable as one Tier-3 SD around a single real choke point (BaseExecutor.js), but PLAN must re-scope Part 1 per R1-R3, correct Part 3\'s target per R5, correct Part 4\'s schema per R6, and split or narrow Part 2 per R7 before writing the PRD.',
    },
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_KEY,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'VALIDATION',
  supabase,
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('VALIDATION', SD_KEY, null, results, { phase: 'LEAD_TO_PLAN' });
console.log('Stored VALIDATION evidence id:', stored.id);
console.log('verdict:', results.verdict, '| confidence:', results.confidence, '| findings:', results.findings.length);
console.log('repo_path:', results.metadata?.repo_path);
console.log('executed_from_cwd:', results.metadata?.executed_from_cwd);
