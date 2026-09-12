import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../lib/sub-agents/testing/test-execution-record.js';

const analysis = `TESTING (PLAN-TO-EXEC, pre-implementation PRD test-strategy judgment). Verdict CONDITIONAL_PASS.

STRATEGY IS EXECUTABLE-AS-WRITTEN IN STRUCTURE. All 6 test_scenarios carry a concrete when/then and map to a real instrument I ran today against this worktree. Named artifacts all exist: scripts/modules/claude-md-generator/index.js (assertSingleReadFit L752, SINGLE_READ_TOKEN_CAP=25000 L666, MUST_FIT_SINGLE_READ L706), scripts/generate-claude-md-from-db.js, scripts/section-file-mapping.json, lib/chairman/ratification-writer.mjs (verifyMarkerAgainstLiveSection L82), scripts/adam-startup-check.mjs (renderContractParity L454), scripts/one-off/split-solomon-contract-qf-908.mjs (the cited precedent). The 3 missing _PROVENANCE.md files are deliverables, not gaps.

PREMISES VERIFIED AGAINST LIVE MAIN via singleReadFit() (lib/protocol/contract-read-coverage.cjs:309), HARNESS_BYTES_PER_TOKEN=2.4177:
  CLAUDE_LEAD.md  fits:null  24247 tok  basis=predicted_marginal  (on MUST_FIT_SINGLE_READ -> hard-enforced)
  CLAUDE_ADAM.md  fits:false 49885 tok  basis=raw_lower_bound_exceeds_cap
  CLAUDE_EXEC.md  fits:false 43069 tok  basis=raw_lower_bound_exceeds_cap
  CLAUDE_CORE.md  fits:false 31209 tok  basis=predicted_bytes
FR-1's "LEAD is the urgent hard-enforced one" and FR-4's explicit correction ("CORE is fits:false, not fits:null as the ticket claimed") are both CORRECT against main. The PRD was written from measurement, not recollection.

GAPS (all pre-EXEC fixable; none invalidate the SD):

G1 WRONG TABLE. Scenario 2 and AC-3 say marker_text is on leo_protocol_sections. It is not. marker_text lives on chairman_ratifications; the file it belongs to is resolved via claude-generation-manifest.json -> section_digests.meta[section_id].target_file. There is no "domain" column; the real discriminators are target_contracts (role slugs) and encoded_ref.section_id. A worker running the scenario literally gets zero rows and no error -- reads as a clean pass.

G2 SCENARIO 2 IS DEAD BY CONSTRUCTION FOR 3 OF 4 FILES. Measured: chairman_ratifications has 96 rows, 90 with marker_text; distinct target_contracts = {adam, coordinator, michael, protocol, solomon}; distinct encoded_ref.section_id = {601, 611}. Manifest maps 601->CLAUDE_ADAM.md and 611->CLAUDE_SOLOMON.md. So EXEC, CORE and LEAD carry ZERO ratification markers. The scenario reads as four-file marker coverage but constrains only ADAM. State that explicitly so the pass is not mistaken for breadth.

G3 DRIFT COUNT IS 3, NOT ~12. Measured on section 601 -> CLAUDE_ADAM.md: 74 marker rows, 71 present as literal substrings, 3 missing (ids 42e6a0fb, 5fa25f7d, b7a11c0b). Those 3 are absent from EVERY companion/sibling file too, i.e. they are the QUIET_TICK_RATIFICATION_MARKER_INVALID class (never present at encode time), not content the carve can relocate. Per CLAUDE_ADAM.md's own quiet-tick contract these need a chairman-gated data-repair migration because the append-only ledger permits only the NULL->set transition, so re-encoding is rejected. AC-3's "pre-existing drift on ADAM's ~12 markers is fixed as part of FR-2" is therefore both mis-numbered AND likely outside this SD's authority. Recommend restating as "71/74 present preserved, with the 3 MARKER_INVALID rows explicitly out of scope and routed to the chairman-gated repair path". FR-2's "57 clauses" also disagrees with the measured 74 marker rows.

G4 THRESHOLD IMPRECISION IN SCENARIO 1. "token count measured under 25,000 with fits:true" conflates two different thresholds. fits:true requires < SINGLE_READ_CONFIRMED_FIT_TOKENS = 25000 - 25000*0.068 = 23300. LEAD is 24247 today, so FR-1 must shed >=947 tokens (~2290 bytes) -- a file that lands at 24,900 satisfies the scenario's literal text while still reporting fits:null. AC-1 ("fits:true ... not null/false") is correct; make the scenario match the AC.

G5 SCENARIO 3 NON-VACUITY IS WEAKER THAN IT READS. renderContractParity runs today and reports CLEAN; its vacuity guard fires only at ZERO markers. Measured baseline with the function's own regex is exactly 2: "BANDWIDTH FORECAST" and "BELT COUNTDOWN". A carve that relocates one of the two still reports CLEAN at count=1. Assert count==2 (named), not "non-zero".

G6 MISSING DELIVERABLE -- ENFORCEMENT-LIST MEMBERSHIP. No FR or AC covers updating MUST_CONFIRM_SINGLE_READ_FIT (currently []) or MUST_FIT_SINGLE_READ after each carve. index.js:730-739 states the discipline explicitly ("a file joins this list when the SD that makes it fit has landed") and names CLAUDE_ADAM.md as an intended member. Without this the split is not durably enforced and every file can silently drift back over cap -- the exact failure mode this SD exists to close. Add as an AC on FR-1..FR-4.

REUSABLE MARKER-CHECK MECHANISM: a new small checker script IS needed; it should be an FR-1 deliverable rather than assumed.
 - verifyMarkerAgainstLiveSection (ratification-writer.mjs:82) is NOT bulk-reusable: it THROWS (does not return false) when the marker is absent, and it THROWS on a stale render -- precisely the mid-migration state between the MOVES[] write and the regen. Wrapping it in try/catch per marker also loses the pass/fail distinction.
 - detectMarkerMissing(liveFileContent, markerText) at lib/chairman/ratification-regression-detector.mjs:49 IS the right pure predicate for a bulk sweep.
 - The pre-write substring assertion at scripts/one-off/qf-20260906-597-split-solomon-foundation-capa-tranche2.mjs:65-76 ("verify marker_text substrings survive BEFORE writing ... abort") is the exact precedent each MOVES[] migration should copy -- fail-closed before the DB write, not after the regen.
 - scripts/one-off/_a3-quiet-tick-dryrun.mjs:27-75 is a working bulk-scan shape to model the checker on.

RUNNABLE COMMANDS THE SCENARIOS MAP TO (all confirmed working today):
 S1/S5: node scripts/generate-claude-md-from-db.js (exit 0 / SINGLE_READ_CAP_EXCEEDED throw), plus singleReadFit(root, file) from lib/protocol/contract-read-coverage.cjs for the fits/tokens reading.
 S2:    new checker over chairman_ratifications + manifest section_digests.meta, using detectMarkerMissing.
 S3:    renderContractParity(repoRoot) from scripts/adam-startup-check.mjs (verified: prints CLEAN today).
 S4:    node scripts/generate-claude-md-from-db.js then git diff --exit-code -- CLAUDE_*_PROVENANCE.md.
 S6:    grep the convention note in the regenerated file AND assert its source row exists in leo_protocol_sections (the DB-sourced half is the load-bearing assertion; a grep alone passes on a hand-edit).

NOT A GAP: no unit/E2E app-test harness is required. This is a governance-content migration verified by regenerate-and-diff plus measurement; vitest/playwright coverage would be theatre. The generate-then-diff-empty check (S4) is the correct DB-first equivalent of a regression test.

RECOMMENDATION: proceed to EXEC. Fix G1/G3/G4/G5 as PRD text corrections and add G6 as an AC before FR-1 lands. G2 is a scoping statement, not a blocker.`;

const res = await storeSubAgentResults(
  'TESTING',
  '170637e5-c8e1-4d44-ab4e-206bf39c8c50',
  'TESTING',
  {
    verdict: 'CONDITIONAL_PASS',
    confidence_score: 88,
    detailed_analysis: analysis,
    metadata: {
      repo_path: 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer',
      executed_from_cwd: process.cwd(),
      mode: 'pre-implementation',
      measured: false,
      test_execution: buildTestExecution(),
      applicability_rule: 'policy_non_applicable_no_code',
      unmeasured_reason: 'PLAN-TO-EXEC pre-implementation PRD test-strategy review. No production code exists for this SD yet, so there is no suite to run. The judgment below is based on live-state measurement of the instruments the PRD names (singleReadFit, renderContractParity, chairman_ratifications marker sweep), not on a test run.',
      gate: 'GATE_SUBAGENT_EVIDENCE',
      measured_fits: {
        'CLAUDE_LEAD.md': { fits: null, tokens: 24247, enforced: true },
        'CLAUDE_ADAM.md': { fits: false, tokens: 49885 },
        'CLAUDE_EXEC.md': { fits: false, tokens: 43069 },
        'CLAUDE_CORE.md': { fits: false, tokens: 31209 }
      },
      marker_baseline: {
        table: 'chairman_ratifications',
        adam_section_id: '601',
        rows_with_marker: 74,
        present: 71,
        missing: 3,
        missing_ids: ['42e6a0fb', '5fa25f7d', 'b7a11c0b'],
        exec_core_lead_markers: 0
      },
      duty_durable_markers_adam: 2,
      confirmed_fit_threshold_tokens: 23300,
      gaps: [
        'G1_wrong_table_leo_protocol_sections',
        'G2_scenario2_zero_yield_for_exec_core_lead',
        'G3_drift_is_3_not_12_and_marker_invalid_class',
        'G4_fits_true_needs_23300_not_25000',
        'G5_duty_count_assert_2_not_nonzero',
        'G6_missing_must_confirm_single_read_fit_membership_AC'
      ]
    }
  },
  { phase: 'PLAN_TO_EXEC', sdKey: 'SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001' }
);
console.log('STORE RESULT:', JSON.stringify(res, null, 2).slice(0, 1200));
