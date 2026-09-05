#!/usr/bin/env node
/**
 * One-off: create the PRD for SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-A via contentOverride
 * (generate-first pattern, SD-FDBK-INFRA-ADD-PRD-DATABASE-001), grounded in direct Explore
 * research (evidence row dc526118-9f8e-4ba2-b59a-f59fa0b7ba4d) against the FR-rewrite-v2
 * text Adam wrote on the SD row, corrected where re-measurement diverged from that text.
 */
import { addPRDToDatabase } from '../prd/index.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-A';

const content = {
  executive_summary:
    'Two writers into sub_agent_execution_results stamp session_id (child E, merged) but neither ' +
    'stamps a real producer identity (source defaults to the uninformative DB default \'manual\') ' +
    'nor invocation_id on the canonical results-storage.js path, and no writer stamps a content ' +
    'hash at all. This child adds all three via a new shared provenance module (no schema ' +
    'migration -- content_hash lives in the existing metadata jsonb column, mirroring the ' +
    'session_id precedent), and extends the two real readers of this table -- ' +
    'subagent-evidence-gate.js (the general-purpose, 4-handoff-wide evidence gate) and ' +
    'activation-invariant-gate.js\'s TESTING-scoped loadTestingEvidence() at LEAD-FINAL-APPROVAL ' +
    '-- to grade a row missing any of the four provenance fields as ABSENT. Per this repo\'s own ' +
    'Observe-Only-First policy (CLAUDE_CORE.md) and the SD\'s own warning about repeating ' +
    '"exactly the Gate 2 outage of 03:0xZ", the new grading ships ADVISORY-ONLY (warnings, never ' +
    'blocking) until a documented promotion, mirroring this exact file\'s own established rollout ' +
    'pattern for SUBAGENT_VERDICT_MODE and the stale-evidence check.',
  functional_requirements: [
    {
      id: 'FR-A1',
      title: 'Shared provenance module: content-hash, producer allowlist, cutover timestamp, phase normalisation',
      priority: 'critical',
      description:
        'No SSOT module for reading/grading sub_agent_execution_results provenance exists today ' +
        '(Explore evidence dc526118: each of the three candidate readers hand-rolls its own query ' +
        'and verdict logic; acceptance-tier-downgrade-gate.js\'s own header admits mirroring ' +
        'activation-invariant-gate.js by hand). Create lib/sub-agent-executor/evidence-provenance.js ' +
        'exporting: computeContentHash(payload) -- sha256 over a stable-stringified subset of ' +
        '{verdict, confidence, critical_issues, warnings, recommendations, detailed_analysis, ' +
        'summary}, so a reader can re-derive the hash from a row\'s own content and detect ' +
        'post-write tampering; PRODUCER_ALLOWLIST = [\'sub_agent_executor\', \'task_hook\'] ' +
        '(\'manual\' deliberately excluded -- it is the column\'s own DB DEFAULT, the exact value ' +
        'the FR text calls "not a producer"); PROVENANCE_CUTOVER_AT (an ISO timestamp, set now, ' +
        'deliberately erring EARLY rather than exactly at merge -- an early cutover only costs a ' +
        'few extra rows briefly graded under the lenient pre-cutover rule, while a late one would ' +
        'wrongly strict-grade rows that already exist); normalisePhase(phase) mapping all 12 ' +
        'observed spellings (measured live: LEAD, LEAD_TO_PLAN, LEAD_FINAL -> LEAD; PLAN_TO_EXEC, ' +
        'PLAN_TO_LEAD, PLAN-TO-LEAD, PLAN_VERIFICATION, PLAN_PRD -> PLAN; EXEC, EXEC_TO_PLAN, ' +
        'EXEC_IMPLEMENTATION -> EXEC; \'orchestrated\'/null/unmapped -> null) to one of LEAD/PLAN/EXEC; ' +
        'HANDOFF_TYPE_TO_PHASE mapping each of the 4 handoff types subagent-evidence-gate.js runs at ' +
        'to the phase whose work that handoff verifies (e.g. EXEC-TO-PLAN checks evidence FROM the ' +
        'EXEC phase); gradeProvenance(row, {expectedPhase}) returning {absent, preCutover, ' +
        'missingField} so a caller can cite which field was missing.',
      acceptance_criteria: [
        'computeContentHash is a pure function of its payload argument -- same input always yields the same hash',
        'PRODUCER_ALLOWLIST excludes \'manual\'',
        'normalisePhase maps all 12 live-observed spellings correctly per the table above; an unlisted or null spelling returns null',
        'gradeProvenance returns preCutover:true (never absent) for a row created before PROVENANCE_CUTOVER_AT, regardless of its other fields',
        'gradeProvenance names the specific missingField (source/invocation_id/session_id/content_hash/content_hash_mismatch/phase) rather than a generic failure',
      ],
    },
    {
      id: 'FR-A2',
      title: 'results-storage.js stamps source, invocation_id and metadata.content_hash unconditionally',
      priority: 'critical',
      description:
        "lib/sub-agent-executor/results-storage.js's storeSubAgentResults() record object (lines " +
        "798-825) sets neither top-level source nor invocation_id -- both real columns, confirmed " +
        "in the committed schema snapshot. source silently defaults to the DB column default " +
        "'manual' on every row this writer inserts. task-subagent-recorder.cjs (the OTHER writer) " +
        "already sets both (source:'task_hook', invocation_id via its own generateInvocationId()) " +
        "-- this FR brings results-storage.js to parity, plus the new content_hash field neither " +
        "writer has yet. Add source: 'sub_agent_executor' and invocation_id: crypto.randomUUID() " +
        "as top-level record fields (no anti-clobber placement needed -- unlike session_id, neither " +
        "is ever read from the caller's results object, so there is nothing to clobber); compute " +
        "metadata.content_hash via the FR-A1 module AFTER the record object is fully built (so the " +
        "hash reflects the FINAL resolved values of verdict/confidence/etc, not intermediate state), " +
        "assigned onto the same metadata object reference the record already holds.",
      acceptance_criteria: [
        'Every row storeSubAgentResults() writes carries source=\'sub_agent_executor\' (never the \'manual\' default)',
        'Every row carries a non-null invocation_id',
        'Every row carries metadata.content_hash equal to computeContentHash() over that row\'s own final verdict/confidence/critical_issues/warnings/recommendations/detailed_analysis/summary',
        'Recomputing computeContentHash() from a freshly-read row reproduces the same hash stamped at write time',
      ],
    },
    {
      id: 'FR-A3',
      title: 'subagent-evidence-gate.js grades provenance, advisory-only by default',
      priority: 'high',
      description:
        "subagent-evidence-gate.js's select (line 438) currently reads only sub_agent_code, " +
        "created_at, verdict, evaluated_commit_sha:metadata->>evaluated_commit_sha, and its window " +
        "scoping (line 439-440) is sd_id + created_at only -- phase is never read or compared, so " +
        "evidence from a different handoff inside the same time window is silently accepted. Widen " +
        "the select to add source, invocation_id, confidence, critical_issues, warnings, " +
        "recommendations, detailed_analysis, summary, phase, plus session_id:metadata->>session_id " +
        "and content_hash:metadata->>content_hash (all lint-safe per schema-reference-extract.mjs: " +
        "bare names for real top-level columns, alias:metadata->>field for jsonb-nested fields, " +
        "exactly the existing evaluated_commit_sha pattern). For each required agent's latest row, " +
        "additionally run gradeProvenance(row, {expectedPhase: HANDOFF_TYPE_TO_PHASE[handoffType]}) " +
        "from FR-A1. THIS SD's OWN TEXT WARNS the underlying defect class already caused a real " +
        "outage (\"exactly the Gate 2 outage of 03:0xZ\") -- consistent with this repo's " +
        "Observe-Only-First policy (CLAUDE_CORE.md: any NEW enforcement ships observe-only for a " +
        "calibration window before binding promotion) AND this exact file's own established rollout " +
        "precedent (SUBAGENT_VERDICT_MODE and LEO_DISABLE_STALE_EVIDENCE_CHECK both shipped advisory " +
        "first), a provenance-ABSENT verdict is surfaced as an [ADVISORY] warning (mirroring " +
        "detectStaleEvidence's existing warning shape) and does NOT fail the gate unless " +
        "SUBAGENT_EVIDENCE_PROVENANCE_MODE=block is set. Binding promotion is a documented follow-up " +
        "once the writer change (FR-A2) has accumulated enough post-cutover evidence to avoid " +
        "blocking the entire fleet on day one -- the same population risk this SD's own measurement " +
        "found (invocation_id populated on 0 of the newest 40 rows at authoring time).",
      acceptance_criteria: [
        'The widened select string passes scripts/lint/schema-reference-extract.mjs',
        'A required agent\'s pre-cutover latest row never generates a provenance warning',
        'A required agent\'s post-cutover latest row missing any of source/invocation_id/session_id/content_hash generates an [ADVISORY] warning naming the specific missing field, but the gate still passes (passed:true) when SUBAGENT_EVIDENCE_PROVENANCE_MODE is unset',
        'The same missing-field row causes the gate to fail (passed:false) when SUBAGENT_EVIDENCE_PROVENANCE_MODE=block is set',
        'A row from a different phase than HANDOFF_TYPE_TO_PHASE[handoffType] predicts is flagged as out-of-window (not counted as satisfying) rather than silently accepted',
        'All existing subagent-evidence-gate.js behavior (verdict classification, WAIT verdicts, non-evidence tombstones, stale-commit advisory) is unchanged -- verified by the existing 859-line test suite passing unmodified',
      ],
    },
    {
      id: 'FR-A4',
      title: 'activation-invariant-gate.js grades provenance on its TESTING evidence read, advisory-only',
      priority: 'medium',
      description:
        "activation-invariant-gate.js's loadTestingEvidence() (lines 71-84) is the identified " +
        "\"completion-side reader\" at LEAD-FINAL-APPROVAL -- NOTE, corrected from the SD's own " +
        "framing: subagent-evidence-gate.js never actually runs at LEAD-FINAL-APPROVAL " +
        "(REQUIRED_SUBAGENTS['LEAD-FINAL-APPROVAL']=[]), so activation-invariant-gate.js is the real " +
        "second reader, though narrower than the SD title's \"every row\" framing -- it is " +
        "conditionally triggered (machinery-class SDs only) and scoped to sub_agent_code='TESTING' " +
        "alone. Widen its existing select (id, verdict, confidence, metadata, created_at, phase) to " +
        "add source, invocation_id, critical_issues, warnings, recommendations, detailed_analysis, " +
        "summary, and content_hash:metadata->>content_hash; run the same gradeProvenance() check and " +
        "surface the same advisory-only warning shape as FR-A3 (same SUBAGENT_EVIDENCE_PROVENANCE_MODE " +
        "kill-switch, one shared flag across both gates).",
      acceptance_criteria: [
        'The widened select passes schema-reference-extract.mjs',
        'A provenance-ABSENT TESTING row produces an advisory warning without changing the gate\'s existing verdict/activation_invariant_verified logic',
        'Existing activation-invariant-gate.test.js passes unmodified',
      ],
    },
    {
      id: 'FR-A5',
      title: 'Regression tests for the shared module and both gates\' provenance path',
      priority: 'high',
      description:
        'Unit tests for lib/sub-agent-executor/evidence-provenance.js covering: content-hash ' +
        'determinism and mismatch detection; the full normalisePhase mapping table (all 12 live ' +
        'spellings plus an unmapped case); pre-cutover rows never graded absent regardless of other ' +
        'fields; each of the four missing-field cases named individually. Tests for both gates ' +
        'proving: advisory mode warns without failing; block mode fails; existing behavior ' +
        '(verdict classification, WAIT, non-evidence, stale-commit) is provably unchanged by running ' +
        'the existing test suites unmodified alongside the new cases.',
      acceptance_criteria: [
        'New unit test file for evidence-provenance.js covers every classification branch',
        'Existing tests/unit/subagent-evidence-gate.test.js (859 lines) passes with zero modifications required to its existing assertions',
        'Existing activation-invariant-gate.test.js passes with zero modifications required to its existing assertions',
        'New tests demonstrate the advisory-vs-block mode distinction for both gates',
      ],
    },
  ],
  acceptance_criteria: [
    'Every row storeSubAgentResults() writes after this ships carries source, invocation_id, and metadata.content_hash -- verifiable via a trailing population count',
    'Both readers (subagent-evidence-gate.js, activation-invariant-gate.js) can grade any row\'s provenance via the shared module, in advisory mode by default',
    'No DB migration required -- content_hash lives in the existing metadata jsonb column',
    'No regression in either gate\'s existing, heavily-tested behavior',
  ],
  system_architecture:
    'One new shared module (lib/sub-agent-executor/evidence-provenance.js) is imported by the ' +
    'canonical writer (results-storage.js, for stamping) and by both real readers of ' +
    'sub_agent_execution_results (subagent-evidence-gate.js for the general 4-handoff evidence ' +
    'gate; activation-invariant-gate.js for its narrower TESTING-only LEAD-FINAL-APPROVAL check) ' +
    'for grading. This closes the exact duplication Explore evidence found already existing ' +
    '(acceptance-tier-downgrade-gate.js hand-mirrors activation-invariant-gate.js\'s query shape) ' +
    'rather than adding a third independent implementation. task-subagent-recorder.cjs (the ' +
    'second writer) already has source+invocation_id and is not touched by this child; it gains ' +
    'content_hash as a natural follow-up once this module exists, tracked as an explicit ' +
    'out-of-scope item below rather than silently left inconsistent.',
  implementation_approach:
    'FR-A1 ships first (pure, no dependents yet) with its own full unit test coverage. FR-A2 wires ' +
    'the writer; FR-A3/A4 wire the two readers, both gated behind one shared ' +
    'SUBAGENT_EVIDENCE_PROVENANCE_MODE flag (unset=advisory, \'block\'=binding) mirroring this ' +
    'codebase\'s own established per-check rollout convention (SUBAGENT_VERDICT_MODE, ' +
    'LEO_DISABLE_STALE_EVIDENCE_CHECK) rather than inventing a new pattern. FR-A5 tests run ' +
    'throughout, with the two existing 859-line and 153-line test suites re-run unmodified as the ' +
    'no-regression proof before this child\'s own EXEC-TO-PLAN handoff.',
  test_scenarios: [
    {
      scenario: 'computeContentHash() called twice with the same payload object (different instances, same content)',
      expected: 'Identical hash both times',
    },
    {
      scenario: 'computeContentHash() called with a payload whose detailed_analysis differs by one character',
      expected: 'A different hash',
    },
    {
      scenario: 'normalisePhase() called with each of the 12 live-observed spellings plus \'orchestrated\' and null',
      expected: 'Each of the 12 maps to LEAD/PLAN/EXEC per the documented table; \'orchestrated\' and null both return null',
    },
    {
      scenario: 'gradeProvenance() on a row created before PROVENANCE_CUTOVER_AT with no source/invocation_id/metadata at all',
      expected: '{absent: false, preCutover: true} -- never graded absent regardless of missing fields',
    },
    {
      scenario: 'gradeProvenance() on a post-cutover row with source=\'manual\'',
      expected: '{absent: true, missingField: \'source\'} -- \'manual\' is explicitly excluded from PRODUCER_ALLOWLIST',
    },
    {
      scenario: 'subagent-evidence-gate.js with a required agent\'s latest row provenance-ABSENT and SUBAGENT_EVIDENCE_PROVENANCE_MODE unset',
      expected: 'Gate still passes (passed:true); an [ADVISORY] warning names the missing field',
    },
    {
      scenario: 'Same fixture as above with SUBAGENT_EVIDENCE_PROVENANCE_MODE=block',
      expected: 'Gate fails (passed:false)',
    },
    {
      scenario: 'Existing subagent-evidence-gate.test.js suite (859 lines, pre-existing verdict/WAIT/non-evidence/stale-commit fixtures)',
      expected: 'All existing assertions pass unmodified -- proves the widened select and new provenance branch introduce zero behavior change to the gate\'s pre-existing logic',
    },
  ],
  risks: [
    {
      risk: 'Shipping provenance grading as a BLOCKING check on day one would fail nearly every handoff fleet-wide, since 0 of the newest 40 rows carry invocation_id at authoring time -- this SD\'s own text explicitly names this as "exactly the Gate 2 outage of 03:0xZ", a real prior incident, not a hypothetical',
      mitigation: 'Ship advisory-only by default (SUBAGENT_EVIDENCE_PROVENANCE_MODE unset), per CLAUDE_CORE.md\'s Observe-Only-First policy and this exact file\'s own established rollout precedent for SUBAGENT_VERDICT_MODE and the stale-evidence check. Binding promotion is a documented, separate follow-up once post-cutover evidence has accumulated.',
    },
    {
      risk: 'Widening subagent-evidence-gate.js\'s select string could silently break its own 859-line pre-existing test suite if any mock fixture asserts on the literal select string rather than on returned data',
      mitigation: 'Run the full existing suite unmodified as an explicit acceptance criterion (FR-A5) before considering this child\'s EXEC-TO-PLAN handoff ready; any failure is investigated as a real regression, not silenced.',
    },
    {
      risk: 'normalisePhase()\'s LEAD/PLAN/EXEC mapping for handoff-name-shaped spellings (e.g. EXEC_TO_PLAN, PLAN_TO_EXEC) is a reasoned design inference (the row\'s phase reflects which phase\'s WORK is being verified by that handoff), not a directly-measured fact, since no existing code encodes this mapping today',
      mitigation: 'Documented explicitly here and in the module\'s own comments with the reasoning; pinned by unit tests against the exact 12-spelling list measured live, so a wrong mapping is falsifiable and correctable without touching call sites.',
    },
  ],
  out_of_scope: [
    {
      item: 'Stamping metadata.content_hash on task-subagent-recorder.cjs (the second writer, which already has source+invocation_id)',
      reason: 'FR-A2 only widens results-storage.js, the writer this SD\'s measurement focused on. task-subagent-recorder.cjs gaining content_hash is a natural, low-risk follow-up once lib/sub-agent-executor/evidence-provenance.js exists, but adding it here without its own measurement of that writer\'s call sites risks scope creep beyond what was actually investigated.',
    },
    {
      item: 'Promoting SUBAGENT_EVIDENCE_PROVENANCE_MODE to block (binding) by default',
      reason: 'Requires a documented calibration window with real post-cutover population data, per CLAUDE_CORE.md\'s Observe-Only-First policy -- exactly the same gate this SD\'s own text already learned to respect (it happened to this exact file once, per the SD\'s "Gate 2 outage of 03:0xZ" reference).',
    },
  ],
};

async function main() {
  await addPRDToDatabase(SD_KEY, 'W5 child A PRD: shared evidence-provenance module + writer/reader stamping, advisory-first rollout', content);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
