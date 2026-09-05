#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B, LEAD-TO-PLAN phase.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B';

const findings = [
  {
    id: 'bypass-ledger-sole-writer-and-handoff-id-gap',
    severity: 'HIGH',
    summary: "scripts/modules/handoff/cli/cli-main.js:784-796 is the ONLY .insert() into bypass_ledger in the codebase. It never sets handoff_id. Live query confirms 165/165 rows (100%) have handoff_id NULL. bypass_ledger.handoff_id already exists as a UUID soft FK (database/migrations/20260516130001_add_bypass_ledger.sql:8, no REFERENCES) -- no migration needed for FR-B1.",
  },
  {
    id: 'bypass-id-not-threaded-to-either-recorder-path',
    severity: 'HIGH',
    summary: "HandoffRecorder.js's createArtifact() (called only from recordSuccess(), lines 421/425) mints handoffId=randomUUID() at line 936 for the ACCEPTED sd_phase_handoffs row. recordFailure() has a SEPARATE sd_phase_handoffs insert (~line 589) for the REJECTED path. Live data shows real bypass_ledger rows correlate with BOTH outcomes (bypass override succeeds -> accepted; bypass override attempted but handoff still ends rejected -> recordFailure). FR-B1 must thread the bypass_ledger row id into result.bypassLedgerId (via lib/handoff/bypass-stamp.js's buildBypassStamp/applyBypassToResult, then BaseExecutor.js's two call sites) and write handoff_id back from BOTH createArtifact() and recordFailure()'s insert sites, not just the accepted path.",
  },
  {
    id: 'refused-before-handoff-is-a-legitimate-third-outcome',
    severity: 'MEDIUM',
    summary: "Some bypass_ledger rows correspond to NO sd_phase_handoffs row at all within a reasonable window (handoff refused/errored before any artifact was minted, e.g. workflow-sequence enforcement runs even under --bypass-validation per cli-main.js:903-906). FR-B4's census predicate must classify this as a distinct, non-violating outcome -- not lump it in with genuinely-unjoined rows where a handoff row DOES exist but handoff_id is still NULL.",
  },
  {
    id: 'session-id-fetched-then-discarded-in-evidence-gate',
    severity: 'HIGH',
    summary: "scripts/modules/handoff/gates/subagent-evidence-gate.js:462 already selects session_id:metadata->>session_id (child A, merged) into the local row/query result, but lines ~520-543 build the gate's failing[]/nonEvidence[]/unknownVerdicts[] detail arrays as {agent, verdict, created_at} only -- session_id is read only for the separate provenanceAbsent computation and never attached to the per-agent failure detail objects that reach gateResults. FR-B2's self-authorship refusal needs session_id ON those detail objects, which requires widening this gate's failing[]/nonEvidence[] shape (additive field, not a query change -- the data is already fetched).",
  },
  {
    id: 'failedGate-is-only-a-gate-name-not-a-row-id',
    severity: 'HIGH',
    summary: "gateResults.failedGate (read by BaseExecutor.js's bypass-handling site, ~line 665-684) is only a gate NAME string (e.g. GATE_SUBAGENT_EVIDENCE or a TESTING-verdict-driven gate name). The specific sub_agent_execution_results row's session_id is NOT reachable from gateResults.failedGate alone -- it must come from gateResults.gateResults[failedGate].details.failing/nonEvidence, which requires the widening in the prior finding.",
  },
  {
    id: 'only-second-bypass-site-is-in-scope-for-fr-b2',
    severity: 'MEDIUM',
    summary: "BaseExecutor.js has two buildBypassStamp() call sites: (1) ~line 356-368, an authority_fence / coordinator-claim check with no sub-agent-evidence involvement at all; (2) ~line 665-684, the gate_failure site, entered whenever gateResults.passed is false and --bypass-validation is set. Only site (2) is relevant to FR-B2's 'actor authored the failing evidence' check -- site (1) has no evidence row to compare against.",
  },
  {
    id: 'failure-category-is-free-text-no-schema-change-needed',
    severity: 'INFO',
    summary: "scripts/lib/emit-validation-audit-log.mjs's emitValidationAuditLog() checks failure_category only for truthiness -- no enum/CHECK constraint (database/migrations/20260119_validation_audit_log.sql:17, VARCHAR(50) NOT NULL, no CHECK). scripts/modules/handoff/bypass-rubric.js already emits ad hoc refusal-shaped categories ('bypass_shape_rejected', 'bypass_rejected') alongside the plain 'bypass' category. A new 'bypass_refused_self_authored' category is safe, no migration required.",
  },
  {
    id: 'existing-tests-are-structural-only-no-behavioral-coverage',
    severity: 'MEDIUM',
    summary: "tests/integration/cli-main-bypass-validation-audit-parity.test.js is regex/string-match only (readFileSync + pattern checks in fixed char-offset windows starting at \"from('bypass_ledger')\", lines 62/68) -- inserting new fields near that insert block risks pushing content past those hardcoded windows and must be checked. tests/unit/handoff/bypass-stamp.test.js covers only the pure lib/handoff/bypass-stamp.js functions, never BaseExecutor.js's two call sites or HandoffRecorder.js's bypass-metadata path behaviorally. tests/unit/handoff/base-executor-failed-gate-wire.test.js proves BaseExecutor.execute() IS DI-seam-testable end-to-end for the non-bypass failedGate path -- reusable pattern for FR-B3's new bypass-path tests. No existing test anywhere passes {bypassValidation:true} into BaseExecutor.execute() today.",
  },
  {
    id: 'live-replay-confirms-self-authorship-is-the-norm',
    severity: 'HIGH',
    summary: "VALIDATION sub-agent replayed FR-B2's predicate over the 25 most recent real bypass invocations: 10 would have fired (all self-authored TESTING=BLOCKED verdicts), 9 had no session_id to compare (pre-cutover evidence), 6 had no sd_phase_handoffs row at all (refused-before-handoff). Self-authored bypass is the dominant real-world case among evidence-comparable rows, not a rare edge case -- strong evidence this SD closes a real gap.",
  },
  {
    id: 'ci-census-model-script-is-orphaned',
    severity: 'LOW',
    summary: "scripts/ci/audit-log-parity-check.mjs (the closest existing pattern for FR-B4: same bypass_ledger table, rolling-window census, JSON stdout, exit-code-on-violation) is not wired into any GitHub Actions workflow or npm script today -- it is a standalone, manually-invocable script. FR-B4's new predicate should follow its CLI/exit-code shape but needs a CUTOVER-timestamp design (like child A's PROVENANCE_CUTOVER_AT) rather than a rolling window, since the exit bar is 'every row written after this ships', not a percentage over recent history including 158 pre-existing legacy rows.",
  },
  {
    id: 'sd-id-population-already-fixed-by-prior-sd',
    severity: 'INFO',
    summary: "bypass_ledger.sd_id (success_criteria #2) is ALREADY populated correctly going forward by a prior, already-shipped fix (cli-main.js:789, sd_id: resolvedSdRow?.uuid_id -- comment cites SECURITY review finding S1, 2026-09-02, from a different completed SD). Live query confirms: all 5 most-recent bypass_ledger rows (2026-09-03 through 09-05) have sd_id populated; only historical pre-fix rows are NULL. This criterion needs verification/documentation only, not new implementation.",
  },
  {
    id: 'unrelated-normalisePhase-gap-out-of-scope',
    severity: 'LOW',
    summary: "lib/sub-agent-executor/evidence-provenance.js's normalisePhase() PHASE_MAP (shipped, completed child A) is missing bare 'PLAN' and 3 of 4 hyphenated handoff-type spellings. Verified by direct source read. FR-B2 as scoped does NOT call gradeProvenance()/normalisePhase() -- it reads session_id directly off the evidence row's metadata, independent of phase-window grading -- so this gap does not block or affect child B. Routed to the coordinator via /signal feedback (not absorbed into this SD's scope).",
  },
];

const summary = "Explore-phase discovery for SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B: confirmed the SD's measured baselines (165/165 bypass_ledger rows unjoinable) and its parent-work dependency (child A/E session-id stamping). Corrected the initial design on two points: (1) FR-B1 must write handoff_id back from BOTH the accepted (createArtifact) AND rejected (recordFailure) sd_phase_handoffs write sites, and a census predicate must exclude the legitimate 'refused before any handoff row existed' outcome; (2) FR-B2's self-authorship check needs subagent-evidence-gate.js's failing/nonEvidence detail objects widened to carry session_id (already fetched, currently discarded) rather than relying on gateResults.failedGate alone. Live replay over 25 real bypasses confirms self-authored bypass is the dominant case among evidence-comparable rows. sd_id population (success_criteria #2) is already satisfied by prior shipped code -- verify only. One unrelated finding (a normalisePhase() gap in child A's shipped code) is confirmed real but does not affect this SD's design and was routed separately.";

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 88,
    findings,
    warnings: [],
    recommendations: [
      'Thread a new bypassLedgerId field through lib/handoff/bypass-stamp.js (buildBypassStamp/applyBypassToResult), BaseExecutor.js\'s gate_failure call site only, cli-main.js\'s ledger-write block, and both HandoffRecorder.js write sites (createArtifact + recordFailure).',
      'Widen subagent-evidence-gate.js\'s failing[]/nonEvidence[] detail objects to include session_id (field already fetched into the query row) so BaseExecutor.js can read it without a second query.',
      'Model FR-B4\'s census script on scripts/ci/audit-log-parity-check.mjs\'s CLI/exit-code shape but key it on a cutover timestamp (PROVENANCE_CUTOVER_AT-style) and classify refused-before-handoff rows separately from genuinely-unjoined ones.',
      'Do not attempt to reconcile the 158 legacy unjoinable rows\' "disposition" in this SD -- the parent SD text and this SD\'s own scope note it is a going-forward exit bar; treat legacy-row reconciliation as a candidate follow-up, not blocking.',
    ],
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'scripts/modules/handoff/cli/cli-main.js',
        'scripts/modules/handoff/executors/BaseExecutor.js',
        'lib/handoff/bypass-stamp.js',
        'scripts/modules/handoff/recording/HandoffRecorder.js',
        'scripts/modules/handoff/gates/subagent-evidence-gate.js',
        'lib/sub-agent-executor/evidence-provenance.js',
        'lib/sub-agent-executor/results-storage.js',
        'scripts/lib/emit-validation-audit-log.mjs',
        'database/migrations/20260516130001_add_bypass_ledger.sql',
        'database/migrations/20260119_validation_audit_log.sql',
        'tests/integration/cli-main-bypass-validation-audit-parity.test.js',
        'tests/integration/bypass-ledger-check-constraint.test.js',
        'tests/unit/handoff/bypass-stamp.test.js',
        'tests/unit/handoff/base-executor-failed-gate-wire.test.js',
        'scripts/ci/audit-log-parity-check.mjs',
      ],
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'Explore',
    SD_KEY,
    { name: 'Explore' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' },
  );

  console.log('EXPLORE EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
