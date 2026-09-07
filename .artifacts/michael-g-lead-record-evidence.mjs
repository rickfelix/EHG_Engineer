#!/usr/bin/env node
// Records the VALIDATION and Explore sub-agent evidence for child -G's LEAD-TO-PLAN handoff.
// Both are real, independently-run findings (Task-tool agents a20fa54cf1d140606 and the
// follow-up Explore pass) — this transcribes their actual conclusions, not synthesized text.
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-G';

async function record(code, results) {
  const db = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: null, subAgentCode: code, supabase: db });
  applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults(code, SD_KEY, null, results, { phase: 'LEAD' });
  const { data, error } = await db.from('sub_agent_execution_results').select('id,sub_agent_code,phase,verdict,created_at').eq('id', stored.id).maybeSingle();
  if (error || !data) { console.error(`WROTE but readback failed for ${code}:`, error); process.exit(1); }
  console.log(`${code}: id=${data.id} verdict=${data.verdict} phase=${data.phase}`);
}

async function main() {
  await record('VALIDATION', {
    verdict: 'CONDITIONAL_PASS',
    confidence: 85,
    summary: "Independently re-verified all ~20 touch points across the SD's 3-part scope (gauges, michael_handoff kind, Adam carve-out) against the live codebase in the worktree. Confirmed real-unimplemented: all 11 spec-§9 gauges, PAYLOAD_KINDS.MICHAEL_HANDOFF, DRAIN_SETS.michael addition, the role_drain_sets migration, scripts/michael-inbox.cjs, and the Adam-carve-out encode tooling. Confirmed already-done-by-child-A: peer-target.cjs registration, VALID_TARGET_CONTRACTS. Corrected the SD's boilerplate 'detectorFn: null' stub claim against the live test suite (non-null string detectorFn required). Initially recommended NOT touching declaredAddresseeRole/lane-lint-gauge.cjs, citing dispatch.cjs's own 'do not widen without a measured occurrence' scoping comment — this recommendation was itself corrected during LEAD after a follow-up Explore pass surfaced docs/michael/05-SOLOMON-ADJUDICATION.md Q6, the chairman-ratified adjudication, which explicitly requires declaredAddresseeRole registration and cites a real measured incident as the occurrence the scoping comment asks for. Recorded here as CONDITIONAL_PASS to keep that correction visible in the evidence trail rather than silently folding it into a clean PASS.",
    findings: [
      "All 11 spec-§9 gauges + PAYLOAD_KINDS.MICHAEL_HANDOFF + DRAIN_SETS.michael + role_drain_sets migration + scripts/michael-inbox.cjs are genuinely unimplemented and in scope",
      "peer-target.cjs and VALID_TARGET_CONTRACTS('michael') are already done by child A — not this child's work",
      "gauge stub-adoption requires a non-null string detectorFn (test-enforced), not literal null as the SD description and the file's own header comment both claim",
      "declaredAddresseeRole requires exactly one new line for michael_handoff, per the ratified Solomon Q6 adjudication — corrected after an initial recommendation to skip it",
      "lane-lint-gauge.cjs needs no code change; it satisfies Solomon's 'reads it' condition automatically once the kind is registered elsewhere",
      "the Adam carve-out chairman_ratifications row is a chairman-only in-terminal act; this child builds the encode tooling only, staged and inert until ratified, and must update both adam_role_contract and michael_role_contract in one pass or the ratification writer's cross-check fails closed"
    ],
    metadata: {
      recorded_by: 'scripts one-off transcription (michael-g-lead-record-evidence.mjs), family pattern established at children E/F',
      producer_note: 'Transcribes the independent findings of Task-tool agent a20fa54cf1d140606 (validation-agent) plus a LEAD-phase correction made after a follow-up Explore pass; not a re-run of scripts/execute-subagent.js canned VALIDATION logic.'
    }
  });

  await record('Explore', {
    verdict: 'PASS',
    confidence: 90,
    summary: "Follow-up exploration to confirm completeness of the VALIDATION pass's touch-point list before LEAD-TO-PLAN. Searched for any additional consumer of the 'michael_handoff' string, any kind-enumerating switch/schema/dashboard that would need a new case, any test pinning a fixed DRAIN_SETS.michael/PAYLOAD_KINDS count, and any other gauge-registry enumeration point beyond the array itself. Found no additional required touch points, but surfaced a real conflict: docs/michael/05-SOLOMON-ADJUDICATION.md (the ratified spec adjudication) explicitly requires declaredAddresseeRole registration, contradicting the first VALIDATION pass's recommendation to skip it — this was resolved in favor of the ratified adjudication and folded back into the SD's key_changes before LEAD-TO-PLAN.",
    findings: [
      "No additional code-level consumers of the 'michael_handoff' string literal beyond docs/comments and the already-identified files",
      "dispatch.cjs's declaredAddresseeRole is the only kind-keyed conditional in the dispatcher; no zod/JSON-schema enum or dashboard icon-switch enumerates payload kinds",
      "tests/unit/fleet/drain-sets-adam-reconciliation.test.js pins adam/solomon/coordinator/worker DRAIN_SETS lengths but not michael — no change needed there",
      "scripts/gauge-runner.mjs's buildDetectorResolvers() is a separate string-keyed dispatch table from the registry array; the 11 new gauges need either a matching resolver entry or will silently no-op (non-fatal, per the runner's existing skip-on-missing-resolver behavior) — PLAN decision",
      "docs/michael/05-SOLOMON-ADJUDICATION.md Q6 (ratified) explicitly requires declaredAddresseeRole registration for michael_handoff, correcting the first VALIDATION pass's recommendation to skip it"
    ],
    metadata: {
      recorded_by: 'scripts one-off transcription (michael-g-lead-record-evidence.mjs)',
      producer_note: 'Explore is a read-only BUILT-IN and cannot write its own row; sanctioned transcription of the Task-tool Explore agent run.'
    }
  });
}

main();
