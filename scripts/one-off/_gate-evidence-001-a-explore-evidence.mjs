#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-A, LEAD-TO-PLAN phase.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-A';

const findings = [
  {
    id: 'subagent-evidence-gate-select-string',
    severity: 'HIGH',
    summary: "scripts/modules/handoff/gates/subagent-evidence-gate.js:436-440 currently selects only sub_agent_code, created_at, verdict, evaluated_commit_sha:metadata->>evaluated_commit_sha -- no source, invocation_id, or metadata itself. Window scoping (line 439-440) is sd_id + created_at >= phaseStartedAt only; phase/handoff_type on the row itself is never read or compared. GATE_SUBAGENT_EVIDENCE (createSubagentEvidenceGate, line ~688) is wired into LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, PLAN-TO-LEAD only -- never LEAD-FINAL-APPROVAL (REQUIRED_SUBAGENTS['LEAD-FINAL-APPROVAL']=[] in required-subagents.js:63).",
  },
  {
    id: 'completion-side-reader-is-activation-invariant-gate',
    severity: 'HIGH',
    summary: "The SD title's 'completion-side reader... for LEAD-FINAL-APPROVAL' is scripts/modules/handoff/executors/lead-final-approval/gates/activation-invariant-gate.js's loadTestingEvidence() (lines 71-84), which DOES run at LEAD-FINAL-APPROVAL and already selects id, verdict, confidence, metadata, created_at, phase filtered to sub_agent_code='TESTING' only -- narrower than 'every row' the SD title implies (TESTING-only, and only conditionally triggered via evaluateTrigger for machinery-class SDs). A secondary, weaker reader is acceptance-tier-downgrade-gate.js's loadEvidenceRows() (observe-only by default), which does keyword-text scanning, not provenance grading.",
  },
  {
    id: 'results-storage-writer-missing-source-and-invocation-id',
    severity: 'HIGH',
    summary: "lib/sub-agent-executor/results-storage.js's storeSubAgentResults() record object (lines 798-825) sets neither top-level source nor invocation_id -- both real columns on sub_agent_execution_results. source defaults to the DB column default 'manual' (schema doc: source text DEFAULT 'manual'::text, values manual/task_hook/sub_agent_executor), which the SD's FR text correctly identifies as 'not a producer'. This is the SAME writer that ships metadata.session_id (SD-E, already merged).",
  },
  {
    id: 'task-subagent-recorder-already-stamps-invocation-id',
    severity: 'INFO',
    summary: "scripts/hooks/task-subagent-recorder.cjs's buildSubAgentRecord() (lines 363-386) already sets top-level invocation_id (deterministic SHA-256 via generateInvocationId()) and source:'task_hook'. This writer is already ahead of results-storage.js on both fields -- results-storage.js is the one that needs symmetric stamping added.",
  },
  {
    id: 'no-existing-ssot-provenance-module',
    severity: 'INFO',
    summary: 'No shared module centralizes reading/grading provenance fields off sub_agent_execution_results today. Each of subagent-evidence-gate.js, activation-invariant-gate.js and acceptance-tier-downgrade-gate.js hand-rolls its own select+verdict logic (acceptance-tier-downgrade-gate.js\'s own header admits mirroring activation-invariant-gate.js\'s query shape by hand). Building a shared content-hash/phase-normalization helper is new code, not a refactor of an existing SSOT.',
  },
  {
    id: 'schema-reference-lint-mechanics',
    severity: 'MEDIUM',
    summary: "scripts/lint/schema-reference-extract.mjs regex-parses literal .from('table')...select('...') chains (FROM_RE line 60) within a 600-char lookahead window, splits select columns on commas, strips alias: prefixes and ->/->>/.  truncation, then checks each resulting column name against the committed database/schema-reference-snapshot.json (not the live DB). metadata, source, and invocation_id are all real top-level columns in the snapshot for sub_agent_execution_results and pass as bare names; content_hash and session_id are NOT top-level columns and must be referenced as alias:metadata->>content_hash / alias:metadata->>session_id (the exact pattern already used for evaluated_commit_sha) to resolve to the real column metadata and pass lint.",
  },
  {
    id: 'fresh-measurement-confirms-adam-numbers-unchanged',
    severity: 'INFO',
    summary: "Re-measured live at ~03:5xZ-04:1xZ: invocation_id non-null on 0 of the newest 40 sub_agent_execution_results rows (confirms parent's claim exactly). Distinct phase values across those 40 rows: 12 non-null spellings (PLAN_TO_LEAD, EXEC_TO_PLAN, orchestrated, LEAD_FINAL, PLAN_VERIFICATION, LEAD, PLAN_TO_EXEC, PLAN_PRD, PLAN-TO-LEAD [hyphen variant], LEAD_TO_PLAN, EXEC, EXEC_IMPLEMENTATION) plus a 4-row null bucket -- confirms the '12 spellings' claim exactly, including the underscore/hyphen PLAN_TO_LEAD vs PLAN-TO-LEAD duplicate.",
  },
];

const summary = "Explore-phase discovery for SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-A: confirmed the SD's v2 FR-rewrite measurements are accurate and current (0/40 invocation_id populated, 12 phase spellings). Found one meaningful correction to the SD's own framing: subagent-evidence-gate.js never runs at LEAD-FINAL-APPROVAL, so the actual 'completion-side reader' is activation-invariant-gate.js's TESTING-only loadTestingEvidence() -- narrower than the SD title's 'every row' framing, but the closest real match and a reasonable PLAN-phase scoping decision, not an escalation-worthy ambiguity. results-storage.js needs source+invocation_id added alongside the planned content_hash; task-subagent-recorder.cjs already has both. No SSOT provenance module exists yet -- building one is new code. schema-reference-extract.mjs mechanics confirmed: content_hash/session_id must be selected via metadata->>alias, not as bare column names.";

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
    confidence_score: 90,
    findings,
    warnings: [],
    recommendations: [
      'Build the provenance grading primarily into subagent-evidence-gate.js (the real general-purpose, 4-handoff-wide reader); treat activation-invariant-gate.js as the identified completion-side reader, documented explicitly in the PRD rather than assumed silently.',
      'Add source (sub_agent_executor) and invocation_id (crypto.randomUUID()) as top-level fields on results-storage.js\'s record object, alongside the planned metadata.content_hash.',
      'Extract a small shared module (e.g. lib/sub-agent-executor/evidence-provenance.js) exporting computeContentHash(), PROVENANCE_CUTOVER_AT, and normalisePhase() so writer and readers share one definition -- avoids the exact per-gate duplication already observed.',
    ],
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'scripts/modules/handoff/gates/subagent-evidence-gate.js',
        'scripts/modules/handoff/executors/lead-final-approval/gates/activation-invariant-gate.js',
        'scripts/modules/handoff/executors/lead-final-approval/gates/acceptance-tier-downgrade-gate.js',
        'scripts/modules/handoff/required-subagents.js',
        'lib/sub-agent-executor/results-storage.js',
        'scripts/hooks/task-subagent-recorder.cjs',
        'scripts/lint/schema-reference-extract.mjs',
        'database/schema-reference-snapshot.json',
        'docs/reference/schema/engineer/tables/sub_agent_execution_results.md',
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
