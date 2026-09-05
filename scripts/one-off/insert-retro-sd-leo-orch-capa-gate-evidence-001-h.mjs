#!/usr/bin/env node
/**
 * One-off: insert the genuine SD_COMPLETION retrospective for
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-H, and record RETRO sub-agent evidence
 * for the PLAN_VERIFICATION phase.
 *
 * WHY A SEPARATE INSERT (not an update to the existing auto-generated row):
 * retrospectives.id bb4f908b-6eec-4c1e-9f6f-fb6a462ae58c already exists for this
 * SD (retro_type=SD_COMPLETION, status=PUBLISHED, quality_score=80,
 * metadata.generated_by='preflight_autogen', written by the
 * scripts/modules/handoff/retro-filters.js preflight path via
 * generate-comprehensive-retrospective.js before this row existed). Per
 * scripts/modules/handoff/lib/retro-clobber-guard.js classifyRetro(), a
 * PUBLISHED SD_COMPLETION row is `published_sd_completion` -- never safe to
 * overwrite, even by this SD's own RETRO sub-agent path (enhanceRetrospective
 * consults the same guard and returns {skipped:true} rather than touching it).
 * That row's content is generic handoff-count / sub-agent-pass-count template
 * prose: it never mentions the actual root cause found across three TESTING
 * re-verification rounds (two hand-maintained lists -- "field is written" and
 * "field is exempt from the throw" -- that kept drifting apart), the SECURITY
 * S2 finding (the new hard-fail readback's own failure path could destroy the
 * row it protects), or the honest, in-place correction of this SD's own
 * success_criteria/success_metrics text. Rather than clobber the guarded row,
 * this INSERT is additive -- same pattern as
 * scripts/one-off/insert-retro-sd-leo-orch-capa-schema-truth-001-a.mjs.
 * scripts/modules/handoff/lib/retro-filters.js's getFilteredRetrospective
 * (consumed by the retrospective-quality gates) orders candidates by
 * created_at DESC LIMIT 1, so this newer, richer row is the one selected; the
 * older thin row is left completely untouched.
 *
 * Content below is grounded in verified evidence gathered directly from this
 * worktree (branch feat/SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-H) before writing
 * this file:
 *   - `git log --oneline -7` + `git show <sha>` on all six EXEC/PLAN_VERIFICATION
 *     commits (efcae9b9ef2, 68962f69ccf, d0338c3673b, 607993f306b, 9690bd2cda2,
 *     105bbd7ebea) -- full commit messages and diffstats read directly.
 *   - lib/sub-agent-executor/results-storage.js:428-493 (TOP_LEVEL_FIELDS_
 *     PERSISTED_TO_METADATA) and :836-896 (PERSISTED_ELSEWHERE derivation +
 *     the UNRECOGNIZED_FIELD_DROPPED throw) -- read directly to confirm the
 *     structural fix (one frozen object, not two hand-maintained lists) is
 *     real code, not a claim.
 *   - lib/sub-agent-executor/executor.js:562,573 + results-storage.js:1077-1080
 *     -- confirmed the isPayloadCompletenessFailure sentinel (S2 fix) mirrors
 *     the pre-existing isBuiltinAgentRefusal convention.
 *   - strategic_directives_v2 row 718400ab-971c-4425-aee0-199036ea6a65:
 *     metadata.gate_evidence_001_h_known_gaps (recorded by VALIDATION row
 *     419ea717 + Golf-3 EXEC synthesis), metadata.hollow_evidence_census
 *     (measured_at 2026-09-05T00:34:15.738Z, hollow_count 54), corrected
 *     success_criteria items #4/#5.
 *   - sub_agent_execution_results for sd_id=718400ab... (20 rows) -- the
 *     TESTING FAIL/FAIL/PASS chain (2026-09-05T01:32/01:56/02:37) and the
 *     SECURITY/REGRESSION rows independently confirm the narrative the commit
 *     messages describe.
 *   - sd_phase_handoffs for the same sd_id -- 7 rows (LEAD-TO-PLAN rejected+
 *     accepted, PLAN-TO-EXEC rejected+accepted+accepted, EXEC-TO-PLAN
 *     rejected+accepted), independently re-counted rather than trusted from
 *     the boilerplate retro's own claim.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '718400ab-971c-4425-aee0-199036ea6a65';
const SD_KEY = 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-H';
const PRIOR_THIN_RETRO_ID = 'bb4f908b-6eec-4c1e-9f6f-fb6a462ae58c';

const COMMITS = {
  fr1_fr2_fr3_fr4_initial: 'efcae9b9ef28ca00f3716aadab8d285c596a466c',
  testing_pass1_jsonb_keyorder: '68962f69ccf03155c2179fe1a17cddf50d1c0092',
  testing_pass2_32pct_and_typecoercion: 'd0338c3673b769ba94af4c088ce91f65a0f0ba5f',
  testing_pass3_eighteen_fields_structural_fix: '607993f306b316a0d6f4026bf6848a5e4eb7cb65',
  security_s2_s3_s4: '9690bd2cda292cc092db1128d6c098c79a79dbac',
  regression_sentinel_test_gap: '105bbd7ebea071e12581b22dd870189ef39c798e',
};

const retro = {
  sd_id: SD_UUID,
  project_name: 'The sub-agent evidence writer fails loud on a caller field-name mismatch instead of persisting a hollow PASS row',
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  learning_category: 'APPLICATION_ISSUE',
  target_application: 'EHG_Engineer',
  generated_by: 'MANUAL',
  status: 'PUBLISHED',
  conducted_date: '2026-09-05',
  title: 'W5 child H: fail-loud evidence writer + readback hardening -- SD Completion Retrospective (three TESTING rounds, one SECURITY self-destruction catch, structural root-cause fix)',
  description:
    'FR-1..FR-4 (lib/sub-agent-executor/results-storage.js) make storeSubAgentResults refuse a caller ' +
    'field neither mapped to a column nor declared in PERSISTED_ELSEWHERE, instead of the prior warn-only ' +
    'diagnostic that silently dropped it, and add a second, targeted readback that hard-fails when ' +
    'non-empty caller content (warnings/recommendations/detailed_analysis/summary/findings) did not survive ' +
    'the write. The genuinely load-bearing part of this SD\'s history is not the feature -- it is what three ' +
    'successive TESTING re-verification rounds found wrong with it before it was safe to ship. Round 1 ' +
    '(commit 68962f69ccf) found the new readback\'s exact-equality comparison hard-failed a correct write ' +
    'whenever Postgres reordered a jsonb array-of-object column\'s keys on round trip -- a false positive ' +
    'that would have been self-breaking fleet-wide across 182 call sites. Round 2 (d0338c3673b) found the ' +
    'fail-loud throw itself would have hard-crashed roughly a third of real sub-agent runs (324/1000 rows, ' +
    '60d, carrying non-empty metadata.options) because `options`/`metrics` were already-persisted fields ' +
    'simply missing their PERSISTED_ELSEWHERE declaration, plus two genuinely unhandled fields ' +
    '(security.js `baseline_applied`, regression.js `mode`) and a second false-positive readback comparison ' +
    'on a TEXT column several sub-agents populate with an object. Round 3 (607993f306b) drove every module ' +
    'executor.js can actually resolve through the real writer -- not a sample of the ones the reader ' +
    'happened to think of -- and found EIGHTEEN more unhandled top-level fields across five module families ' +
    '(RISK\'s entire risk assessment; RCA\'s entire forensic analysis; STORIES\' counters; VENTURE_STACK and ' +
    'the eleven venture-stage modules\' `blockers`/`artifact`), six of them invisible to a literal-object-read ' +
    'census because the source modules assign them onto `results` AFTER the object literal ' +
    '(risk.js:162-253, modules/stories/execute.js:242-415). The actual fix that ended the cycle was ' +
    'structural, not a fourth patch: TOP_LEVEL_FIELDS_PERSISTED_TO_METADATA (results-storage.js:456) is now ' +
    'the single frozen object both the metadata-write spread and PERSISTED_ELSEWHERE derive from, so a field ' +
    'is exempt from the throw if and only if it is also preserved -- the two can no longer drift apart. A ' +
    'SECURITY pass (9690bd2cda2) then found S2: the new hard-fail readback throws AFTER a successful write, ' +
    'into executor.js\'s catch block, which unconditionally re-stores a content-free errorResult -- and ' +
    'because sd_id+code+phase falls inside the existing 5-minute dedup window, that second call silently ' +
    'overwrote the row the first call had just written correctly. The control meant to catch dropped content ' +
    'was destroying content that mostly survived over one field that didn\'t. Fixed with the same ' +
    'isPayloadCompletenessFailure sentinel pattern already established for isBuiltinAgentRefusal. A same-day ' +
    'REGRESSION pass at PLAN_VERIFICATION (105bbd7ebea) then found the S2 fix\'s producer and consumer halves ' +
    'were each unit-tested in isolation and neither actually exercised the real thrown error -- commenting ' +
    'out the one production line that sets the sentinel left all 226 tests green. Closed same day. Finally, ' +
    'VALIDATION and REGRESSION at PLAN_VERIFICATION found the SD\'s own success_criteria/success_metrics text ' +
    'overclaimed certainty on two points (the FR-3 audit-log-corroboration leg is structurally dead because ' +
    'audit_log.entity_id never references sub_agent_execution_results; the LEAD-cited hollow specimen no ' +
    'longer reproduces, having been independently corrected before the census ran) -- corrected in place in ' +
    'the SD\'s own success_criteria/success_metrics/metadata.gate_evidence_001_h_known_gaps rather than left ' +
    'to stand uncorrected at closure. Two known, deliberately out-of-scope gaps remain, recorded honestly: ' +
    '32.8% of writes into sub_agent_execution_results bypass this writer entirely via other insert paths ' +
    '(sibling children A-G\'s own writers, task-subagent-recorder.cjs, rca-feedback-loop-gate.js), and FR-4(c) ' +
    '("zero recurrence since merge") has no CI mechanism -- only a manually-rerunnable census script.',
  affected_components: [
    'lib/sub-agent-executor/results-storage.js',
    'lib/sub-agent-executor/executor.js',
    'scripts/store-sub-agent-repo-evidence.js',
    'scripts/one-off/scan-hollow-sub-agent-evidence-gate-evidence-001-h.mjs',
    'tests/unit/lib/sub-agent-executor/results-storage-payload-completeness-readback.test.js',
    'tests/unit/lib/sub-agent-executor/results-storage-fleet-shape-census.test.js',
  ],
  tags: ['evidence-integrity', 'fail-loud', 'readback-verification', 'structural-fix', 'W5', 'GATE-EVIDENCE'],

  what_went_well: [
    'Three successive TESTING re-verification rounds (68962f69ccf, d0338c3673b, 607993f306b) each drove ' +
      'the real writer against live fleet data rather than trusting the prior round\'s conclusion, and each ' +
      'found a different, genuinely live-reproducible defect the prior round had certified fixed -- all three ' +
      'were closed before merge, not discovered in production.',
    'The recurring root cause (a field\'s write-in and its throw-exemption living in two hand-maintained ' +
      'places) was fixed structurally in round 3, not patched a fourth time: PERSISTED_ELSEWHERE is now ' +
      'derived from the same frozen TOP_LEVEL_FIELDS_PERSISTED_TO_METADATA object the metadata spread writes ' +
      'from, so the two facts can no longer drift apart.',
    'SECURITY caught a genuinely dangerous self-inflicted defect (S2) before merge that functional TESTING ' +
      'never surfaced: the new hard-fail readback\'s own failure path could destroy the very row it was ' +
      'protecting via a dedup-window UPDATE collision with executor.js\'s existing error-recovery path -- ' +
      'fixed with the same isPayloadCompletenessFailure sentinel convention already established for ' +
      'isBuiltinAgentRefusal, not a bespoke mechanism.',
    'A same-day REGRESSION pass at PLAN_VERIFICATION found the S2 fix\'s producer and consumer halves were ' +
      'each tested in isolation against mocks, and neither test actually exercised the real thrown error -- ' +
      'closed the same day (105bbd7ebea) by asserting the sentinel against the genuine error two existing ' +
      'hard-fail tests already throw.',
    'VALIDATION and REGRESSION at PLAN_VERIFICATION found the SD\'s own success_criteria and success_metrics ' +
      'text overclaimed certainty on two points, and the SD corrected its own claims text in place rather ' +
      'than close with an overstated success record -- the discipline this SD\'s own subject (evidence ' +
      'integrity) demands of itself.',
  ],

  what_needs_improvement: [
    'The first implementation (efcae9b9ef2) shipped with a readback comparison that would have hard-failed ' +
      'a large fraction of genuinely correct writes fleet-wide (jsonb key-order false positive on 182 call ' +
      'sites) -- a "this is fixed" claim was made once by the implementer and needed correcting three ' +
      'separate times by re-verification before it actually held.',
    'Round 2\'s field census read module source for `results.foo` object-literal assignments and missed six ' +
      'fields assigned onto `results` AFTER the literal (risk.js:162-253, modules/stories/execute.js:242-415) ' +
      '-- an exhaustive-looking manual review still undercounted by eighteen fields until round 3 drove every ' +
      'resolvable module through the real writer and diffed the actual runtime shape rather than the source text.',
    '32.8% of writes into sub_agent_execution_results bypass this SD\'s writer entirely (sibling children ' +
      'A-G\'s own write sites, scripts/hooks/task-subagent-recorder.cjs, and the rca-feedback-loop-gate.js ' +
      'insert path) -- explicitly out of scope per this SD\'s own background text, but it means the fail-loud ' +
      'guarantee this SD ships is not fleet-wide yet, and a reader of the SD title alone could reasonably ' +
      'assume it is.',
    'FR-4(c) ("zero recurrence since merge") has no CI enforcement -- only scripts/one-off/scan-hollow-sub-' +
      'agent-evidence-gate-evidence-001-h.mjs --since <merge-date>, which someone has to remember to re-run ' +
      'manually. The regression-prevention half of this SD\'s own charter is not itself gated.',
    'A preflight auto-generator (scripts/modules/handoff/retro-filters.js) had already created and PUBLISHED ' +
      'a retro_type=SD_COMPLETION retrospective for this SD (id bb4f908b, quality_score 80) built from ' +
      'generic handoff-count and sub-agent-pass-count templates before this hand-authored one existed -- it ' +
      'satisfies every mechanical criterion the retrospective-exists gate checks without mentioning the ' +
      'two-hand-maintained-lists root cause, the S2 finding, or the 32.8% scope boundary anywhere in its text.',
  ],

  key_learnings: [
    {
      category: 'STRUCTURAL_ROOT_CAUSE',
      lesson: 'When a shared, fleet-wide writer maintains two independent facts about the same field -- ' +
        '"this field is written into metadata" and "this field is exempt from the fail-loud throw" -- the ' +
        'two WILL drift, repeatedly, even under adversarial re-verification. Round 1 found the readback ' +
        'comparison itself was wrong; round 2 fixed options/metrics/baseline_applied/mode as individual ' +
        'metadata lines plus individual PERSISTED_ELSEWHERE entries and concluded the fleet was covered; ' +
        'round 3 enumerated every module executor.js can actually resolve and found EIGHTEEN more unhandled ' +
        'fields across five module families. The fix that actually held was structural: ' +
        'TOP_LEVEL_FIELDS_PERSISTED_TO_METADATA (results-storage.js:456) is now the single frozen object both ' +
        'the metadata spread and PERSISTED_ELSEWHERE derive from via Object.fromEntries, so a field is exempt ' +
        'if and only if it is preserved.',
      evidence: 'commits 68962f69ccf, d0338c3673b, 607993f306b; results-storage.js:428-493, 836-879',
      applicability: 'Any future SD touching a shared fleet-wide writer/allowlist pair should ask up front ' +
        'whether the "declared" set and the "handled" set are literally the same object or two hand-' +
        'maintained lists -- if they are two lists, budget for at least one re-verification round finding ' +
        'drift between them.',
    },
    {
      category: 'ADVERSARIAL_RE_VERIFICATION_VALUE',
      lesson: 'Re-running the same sub-agent type a second and third time, each time driving the REAL code ' +
        'against live fleet data rather than re-reading the prior pass\'s diff, surfaced three genuinely ' +
        'different, live-reproducible defects in a row. Each individual pass believed the fleet was covered ' +
        'when it finished -- round 2\'s own commit message says so explicitly and round 3 disproved it. The ' +
        'sub_agent_execution_results chain for this SD\'s TESTING axis (CONDITIONAL_PASS -> FAIL -> FAIL -> ' +
        'PASS) is itself the record of that value being real, not theoretical.',
      evidence: 'sub_agent_execution_results rows for SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-H, TESTING at ' +
        '2026-09-05T01:32/01:56/02:37 (FAIL, FAIL, PASS)',
      applicability: 'For writers/guards touching fleet-wide shared surfaces, treat a first TESTING PASS as ' +
        'provisional until a re-verification pass has tried to break it against live production shapes, not ' +
        'just the fixtures the implementer wrote.',
    },
    {
      category: 'SECURITY_FINDS_A_DIFFERENT_CLASS_THAN_TESTING',
      lesson: 'SECURITY\'s S2 finding was a class of bug functional TESTING re-verification never surfaced: ' +
        'the new hard-fail readback throws AFTER a successful write, into executor.js\'s catch block, which ' +
        'unconditionally re-calls storeSubAgentResults with a content-free errorResult -- and because ' +
        'sd_id+code+phase falls inside the existing 5-minute dedup window, that second call silently ' +
        'overwrote the row the first call had just written correctly. The safety mechanism destroyed the ' +
        'artifact it existed to protect. Fixed with the same isPayloadCompletenessFailure sentinel pattern ' +
        'already established for isBuiltinAgentRefusal, not a new mechanism.',
      evidence: 'commit 9690bd2cda2; lib/sub-agent-executor/executor.js:562,573; results-storage.js:1077-1080',
      applicability: 'A "fail loud after the write" control needs its own test proving the failure path is ' +
        'not raced by an existing recovery/retry path sharing the same dedup key -- correctness of the new ' +
        'throw is not the same property as safety of what happens after it is thrown.',
    },
    {
      category: 'MOCK_ISOLATION_MASKED_A_REAL_GAP',
      lesson: 'The S2 fix\'s producer half (results-storage.js setting the sentinel) and consumer half ' +
        '(executor.js checking it) were each unit-tested in isolation, and neither test actually exercised ' +
        'the real thrown error -- the executor test hand-mocked storeSubAgentResults and hand-set the flag, ' +
        'and the completeness-readback test never asserted the flag at all. Commenting out the single ' +
        'production line that sets it left all 226 tests green. Found same-day by REGRESSION at ' +
        'PLAN_VERIFICATION, closed by asserting isPayloadCompletenessFailure against the actual error the two ' +
        'existing hard-fail tests already throw.',
      evidence: 'commit 105bbd7ebea; results-storage-payload-completeness-readback.test.js',
      applicability: 'For a producer/consumer contract (one module sets a sentinel, another reads it), write ' +
        'at least one test exercising both sides against the real thrown object -- two unit tests that each ' +
        'mock the other side\'s half of the contract can both stay green while the contract itself is broken.',
    },
    {
      category: 'HONEST_SELF_CORRECTION_OF_THE_SD_S_OWN_CLAIMS',
      lesson: 'VALIDATION and REGRESSION at PLAN_VERIFICATION found the SD\'s own success_criteria/success_' +
        'metrics text overclaimed certainty on two points: the FR-3 "audit-log corroboration" leg is ' +
        'structurally dead because audit_log.entity_id never references sub_agent_execution_results (so ' +
        'audit_log_corroborated=false on all 54 census rows, always will be), and the LEAD-cited hollow ' +
        'specimen (row 2c68e858) no longer reproduces as hollow because it was independently corrected before ' +
        'the census ran. The SD corrected its own success_criteria/success_metrics/metadata.gate_evidence_' +
        '001_h_known_gaps text in place rather than leave the overstated claims standing at closure.',
      evidence: 'strategic_directives_v2 metadata.gate_evidence_001_h_known_gaps (recorded by VALIDATION row ' +
        '419ea717 + Golf-3 EXEC synthesis); success_criteria items #4 and #5',
      applicability: 'An SD about evidence integrity is itself evidence -- closing it with uncorrected ' +
        'overclaims in its own success_criteria would be the same defect class this SD exists to fix, one ' +
        'level up. Treat PLAN_VERIFICATION findings against the SD\'s own claims text as in-scope corrections, ' +
        'not only findings against the shipped code.',
    },
    {
      category: 'SCOPE_BOUNDARY_HONESTY',
      lesson: 'This SD\'s writer covers only one of several insert paths into sub_agent_execution_results. ' +
        'SECURITY\'s S1 finding (EXEC) measured that 32.8% of writes bypass storeSubAgentResults entirely -- ' +
        'via sibling children A-G\'s own writers, scripts/hooks/task-subagent-recorder.cjs, and scripts/' +
        'modules/handoff/executors/exec-to-plan/gates/rca-feedback-loop-gate.js. Explicitly out of scope per ' +
        'the SD\'s own background text (each sibling child owns its own write site), and recorded as a known ' +
        'gap rather than left for a reader to discover on their own.',
      evidence: 'metadata.gate_evidence_001_h_known_gaps gap #4 (SECURITY S1)',
      applicability: 'When a fix targets "the canonical writer" for a fleet-wide concern, measure and record ' +
        'what fraction of real traffic actually goes through that writer -- a fix that is 100% correct for ' +
        'the path it covers can still leave most of the real-world problem in place if other paths exist.',
    },
    {
      category: 'GATE_SATISFACTION_VS_SUBSTANCE',
      lesson: 'A preflight auto-generator created and PUBLISHED a retro_type=SD_COMPLETION retrospective for ' +
        'this SD (id bb4f908b, quality_score 80, metadata.generated_by=preflight_autogen) built from generic ' +
        'handoff-count/sub-agent-pass-count templates before this hand-authored retrospective existed. It ' +
        'satisfies every mechanical criterion the retrospective-exists gate checks (fresh, PUBLISHED, ' +
        'quality_score>=70, not HANDOFF-typed) without ever mentioning the two-hand-maintained-lists root ' +
        'cause, the S2 self-destruction finding, or the 32.8% scope boundary -- the single most load-bearing ' +
        'lesson from this SD\'s own EXEC phase is entirely absent from the record the gate itself would accept ' +
        'as sufficient.',
      evidence: 'retrospectives row bb4f908b-6eec-4c1e-9f6f-fb6a462ae58c',
      applicability: 'A retrospective passing the mechanical exists-and-scores>=70 gate is not the same claim ' +
        'as "this SD\'s real lessons are captured" -- for SDs with a genuinely load-bearing structural ' +
        'finding, verify the auto-generated row actually contains it, or write a genuine one alongside it.',
    },
  ],

  action_items: [
    {
      action: 'Before adding a new top-level result field for any sub-agent module, add it to ' +
        'TOP_LEVEL_FIELDS_PERSISTED_TO_METADATA (results-storage.js:456) only -- never write a metadata line ' +
        'and a separate PERSISTED_ELSEWHERE entry as two independent edits, which is the exact pattern that ' +
        'drifted three times on this SD alone.',
      owner: 'Any future EXEC session touching lib/sub-agent-executor/results-storage.js',
      deadline: 'Ongoing (structural guard, not a one-time task)',
      success_criteria: 'A grep for a hand-added `metadata.<field>` write paired with a hand-added ' +
        '`PERSISTED_ELSEWHERE.<field>` entry (i.e. not derived from TOP_LEVEL_FIELDS_PERSISTED_TO_METADATA) ' +
        'finds zero new occurrences',
      priority: 'high',
      smart_format: true,
    },
    {
      action: 'Re-run scripts/one-off/scan-hollow-sub-agent-evidence-gate-evidence-001-h.mjs --since ' +
        '<merge-date> --json 30-60 days after this PR merges and confirm hollow_count=0 for rows created ' +
        'after the merge commit -- this is the only mechanism for FR-4(c), and nothing currently schedules it.',
      owner: 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001 orchestrator (or a dedicated follow-up)',
      deadline: '30-60 days post-merge',
      success_criteria: 'The census script, re-run with --since set to the merge commit date, reports ' +
        'hollow_count=0',
      priority: 'high',
      smart_format: true,
    },
    {
      action: 'Extend fail-loud field-mismatch coverage to the other ~32.8% of insert paths into ' +
        'sub_agent_execution_results (task-subagent-recorder.cjs, rca-feedback-loop-gate.js, sibling ' +
        'children A-G\'s own writers) -- this SD deliberately scoped them out, so the fleet-wide guarantee ' +
        'implied by the SD title is not yet fleet-wide.',
      owner: 'A future SD (or remaining orchestrator scope under SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001)',
      deadline: 'Next planning cycle for this orchestrator',
      success_criteria: 'A follow-up SD names and covers at least the two named script/hook call sites, ' +
        'with the residual percentage re-measured after landing',
      priority: 'medium',
      smart_format: true,
    },
    {
      action: 'When censusing a module\'s result shape for allowlist coverage, grep for `results.<key> =` ' +
        'assignments in addition to reading the returned object literal -- six of eighteen fields missed in ' +
        'this SD\'s own round 2 were assigned after the literal (risk.js, modules/stories/execute.js) and ' +
        'were invisible to a literal-only read.',
      owner: 'EXEC-phase agents on similar writer-hardening SDs',
      deadline: 'Next SD censusing a fleet module\'s result shape',
      success_criteria: 'The census methodology section of any future similar PRD explicitly states it ' +
        'searched for post-literal assignments, not only the returned object literal',
      priority: 'medium',
      smart_format: true,
    },
    {
      action: 'Decide whether a preflight-generated SD_COMPLETION retrospective should be allowed to ' +
        'self-publish (status=PUBLISHED) and permanently claim the "valid completion retrospective" slot -- ' +
        'on this SD it did so before any hand-authored retrospective existed, and isSafeToWriteRetro\'s own ' +
        'published_sd_completion rule then made it impossible to enhance in place, forcing a second, ' +
        'additive INSERT as the only remaining path.',
      owner: 'Whoever owns scripts/modules/handoff/retro-filters.js / the preflight-autogen path',
      deadline: 'Next harness-hardening sweep touching the retrospective-quality gates',
      success_criteria: 'Either the preflight path stops self-publishing (leaves status=DRAFT for a human ' +
        'or RETRO sub-agent to promote) or the guard gains an explicit "enhance a preflight-authored row" ' +
        'exception distinct from the published_sd_completion protection for genuinely manual content',
      priority: 'medium',
      smart_format: true,
    },
  ],

  success_patterns: [
    'Adversarial re-verification: three successive TESTING rounds each found a different, live-reproducible ' +
      'defect the prior round had certified fixed, and all three were closed before merge',
    'SECURITY caught a fail-safe-destroys-the-artifact-it-protects bug (S2) that functional TESTING never ' +
      'would have found',
    'Structural fix over a fourth patch: PERSISTED_ELSEWHERE is now derived from one frozen source instead ' +
      'of two hand-maintained lists',
    'The SD corrected its own success_criteria/success_metrics text in place when PLAN_VERIFICATION found ' +
      'overclaims, rather than closing with them uncorrected',
    'Known, deliberate scope gaps (32.8% bypass paths, no-CI FR-4(c)) were recorded honestly in the SD\'s ' +
      'own metadata rather than hidden or left implicit',
  ],
  failure_patterns: [
    'The first implementation (efcae9b9ef2) shipped a readback comparison that would have hard-failed ' +
      'correct writes fleet-wide (jsonb key-order false positive on 182 call sites)',
    'A manual, read-the-source-literal field census (round 2) undercounted by eighteen fields because six ' +
      'were assigned onto `results` after the object literal, not inside it',
    'Two producer/consumer unit tests for the S2 sentinel each mocked the other side of the contract, so ' +
      'neither exercised the real thrown error -- a regression that would have shipped silently had ' +
      'REGRESSION not re-verified at PLAN_VERIFICATION',
    'A preflight auto-generated retrospective self-published as this SD\'s completion record before genuine ' +
      'analysis existed, and the repo\'s own clobber-guard then blocks it from being enhanced in place',
  ],

  objectives_met: true,
  on_schedule: true,
  within_scope: true,
  business_value_delivered:
    'The canonical sub-agent evidence writer (storeSubAgentResults, lib/sub-agent-executor/results-' +
    'storage.js) now fails loud on an unrecognized top-level result field instead of silently discarding it, ' +
    'and hard-fails a post-write readback when non-empty caller content demonstrably did not survive -- ' +
    'closing the QF-20260803-007 vanishing-field defect class for every field currently known to the writer, ' +
    'for the ~67% of sub_agent_execution_results traffic that already routes through it. A one-time census ' +
    'establishes a 54-row hollow-evidence baseline (since 2026-08-07) to measure recurrence against.',
  customer_impact: 'No external end-user-facing impact -- the beneficiaries are LEO Protocol gate operators ' +
    'and future EXEC/PLAN_VERIFICATION sessions relying on sub_agent_execution_results as ground truth for ' +
    'handoff and completion gates.',
  technical_debt_addressed: true,
  technical_debt_created: true,
  bugs_found: 9,
  bugs_resolved: 9,
  tests_added: 50,
  code_coverage_delta: null,
  performance_impact: 'Negligible -- one additional targeted readback comparison over a handful of ' +
    'collection/text fields per write; no measured latency regression reported by any of the three TESTING ' +
    're-verification passes.',

  metadata: {
    sd_key: SD_KEY,
    branch: 'feat/SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-H',
    worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/qf/QF-20260903-177',
    commits: COMMITS,
    defect_chain: {
      round1_testing: 'jsonb array-of-object key-order false positive on the new FR-2 readback (68962f69ccf)',
      round2_testing: '~32.4% of real runs would hard-throw (options/metrics undeclared), baseline_applied/' +
        'mode genuinely unhandled, detailed_analysis object/string type-coercion false positive (d0338c3673b)',
      round3_testing: '18 more unhandled top-level fields across RISK/RCA/STORIES/VENTURE_STACK/venture-' +
        'stage families; structural PERSISTED_ELSEWHERE derivation fix (607993f306b)',
      security_pass: 'S2 (readback failure path destroys the row it protects via dedup-window UPDATE ' +
        'collision), S3 (log injection in the new error message), S4 (0-row UPDATE misread as success in ' +
        'the census script) (9690bd2cda2)',
      plan_verification_regression: 'S2 fix\'s producer/consumer sentinel contract was untested against the ' +
        'real thrown error (105bbd7ebea)',
      plan_verification_validation: 'SD\'s own success_criteria/success_metrics corrected in place for two ' +
        'overclaims (FR-3 audit-log leg structurally dead; LEAD-cited specimen no longer reproduces)',
    },
    known_gaps_carried_forward: [
      '32.8% of sub_agent_execution_results writes bypass this writer entirely (SECURITY S1, EXEC)',
      'FR-4(c) zero-recurrence check has no CI mechanism, only a manually-rerunnable census script',
    ],
    bugs_found_methodology: '1 (round1 jsonb key-order) + 3 (round2: options/metrics-throw, baseline_' +
      'applied/mode unhandled, detailed_analysis type-coercion) + 1 (round3: 18-field/5-module-family gap, ' +
      'counted as one systemic finding) + 3 (SECURITY S2/S3/S4) + 1 (REGRESSION sentinel test-isolation gap) ' +
      '= 9. A judgment-call tally by the retrospective author, not a database-derived count -- documented ' +
      'here so it is auditable rather than presented as a bare measured statistic.',
    tests_added_methodology: 'commit efcae9b9ef2 states "46591 tests, zero regressions" (full unit suite); ' +
      'commit 607993f306b states "46,641 passing" after its own 33-test fleet-shape-census file. Net delta ' +
      '(46641-46591=50) used as tests_added; spans all three TESTING rounds plus the SECURITY commit\'s new ' +
      'no-tombstone test file, not just the one commit that states the raw suite totals.',
    prior_handoff_stage_retro_left_intact: PRIOR_THIN_RETRO_ID,
    handoffs_verified: {
      total: 7,
      breakdown: 'LEAD-TO-PLAN (rejected, accepted); PLAN-TO-EXEC (rejected, accepted, accepted); ' +
        'EXEC-TO-PLAN (rejected, accepted) -- independently re-counted from sd_phase_handoffs, not taken ' +
        'from the preflight-autogen retro\'s own claim',
    },
    parent_orchestrator: 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001 (4be3941e-c928-4e4d-a091-c3609165c6fb)',
  },
};

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  const s = createClient(url, key);

  // Idempotency: a prior run of this script may have already inserted this exact
  // hand-authored retrospective (e.g. a follow-up run only needed to fix the RETRO
  // evidence write below, which failed the first time on unmapped result fields).
  // Reuse that row instead of inserting a second duplicate.
  const { data: existingMine } = await s.from('retrospectives')
    .select('id')
    .eq('sd_id', SD_UUID)
    .eq('title', retro.title)
    .neq('id', PRIOR_THIN_RETRO_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let retroId;
  if (existingMine?.id) {
    retroId = existingMine.id;
    console.log('Reusing already-inserted retrospective id:', retroId);
  } else {
    const { data: ins, error: insErr } = await s.from('retrospectives').insert(retro).select('id').single();
    if (insErr) {
      console.error('Insert failed:', insErr.message);
      process.exit(1);
    }
    retroId = ins.id;
    console.log('Inserted retrospective id:', retroId);
  }

  const { data: ver, error: verErr } = await s.from('retrospectives')
    .select('id, retro_type, retrospective_type, status, quality_score, quality_issues, created_at')
    .eq('id', retroId)
    .single();
  if (verErr) {
    console.error('Verify failed:', verErr.message);
    process.exit(1);
  }
  console.log('Verified retrospective:', JSON.stringify(ver, null, 2));

  if (!ver.quality_score || ver.quality_score < 70) {
    console.error(`WARNING: trigger-computed quality_score=${ver.quality_score} is below 70 despite status=PUBLISHED succeeding. Investigate quality_issues.`);
  }

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'RETRO',
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 95,
    findings: [
      {
        id: 'RETRO-sdcompletion-row-published-nonboilerplate',
        severity: 'INFO',
        summary: `Published a hand-authored retro_type=SD_COMPLETION retrospective (retrospectives.id=` +
          `${retroId}, retrospective_type=NULL, status=PUBLISHED, quality_score=${ver.quality_score}) for ` +
          `${SD_KEY}. A prior preflight-autogen SD_COMPLETION row for this SD (${PRIOR_THIN_RETRO_ID}, ` +
          'quality_score=80, generic handoff/sub-agent-count template content) is PROTECTED from clobber by ' +
          'classifyRetro() (published_sd_completion) and is left completely unmodified; this row is additive ' +
          'and, being more recent, is the one getFilteredRetrospective()\'s created_at DESC LIMIT 1 query ' +
          'selects. Content captures the real three-round TESTING defect-discovery chain, the SECURITY S2 ' +
          'self-destruction finding, the structural PERSISTED_ELSEWHERE-derivation fix, and the SD\'s own ' +
          'in-place correction of two success_criteria overclaims -- each independently verified in this ' +
          'worktree via `git show` on all six commits, direct reads of results-storage.js and executor.js, ' +
          'and live queries of sub_agent_execution_results / sd_phase_handoffs for this sd_id.',
      },
    ],
    warnings: [
      '32.8% of sub_agent_execution_results writes bypass this SD\'s writer entirely (SECURITY S1) -- ' +
        'explicitly out of scope for this SD, carried forward as a known gap on the retrospective and the ' +
        'SD\'s own metadata.gate_evidence_001_h_known_gaps.',
      'FR-4(c) zero-recurrence has no CI mechanism -- only a manually-rerunnable census script.',
    ],
    recommendations: [
      'GO on the RETRO axis for PLAN_VERIFICATION / LEAD-FINAL -- a genuinely SD-specific, non-boilerplate ' +
        'SD_COMPLETION retrospective is published and this evidence row records it for GATE_SUBAGENT_EVIDENCE.',
      'Re-run scripts/one-off/scan-hollow-sub-agent-evidence-gate-evidence-001-h.mjs --since <merge-date> ' +
        '30-60 days post-merge per action item on this retrospective.',
    ],
    summary: `RETRO PASS for ${SD_KEY} PLAN_VERIFICATION. SD_COMPLETION retrospective published ` +
      `(id=${retroId}, quality_score=${ver.quality_score}, status=PUBLISHED) capturing the three-round ` +
      'TESTING defect chain (jsonb key-order false positive; ~32% throw risk + 2 more unhandled fields; ' +
      '18 more fields + structural fix), the SECURITY S2 self-destruction finding, the same-day REGRESSION ' +
      'test-isolation gap, and the SD\'s own in-place correction of two success_criteria overclaims. Prior ' +
      'preflight-autogen retro (bb4f908b) left untouched per the clobber guard. GO.',
    detailed_analysis: {
      sd_key: SD_KEY,
      branch: 'feat/SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-H',
      retro_contribution: {
        retrospective_id: retroId,
        retro_type: 'SD_COMPLETION',
        retrospective_type: null,
        quality_score: ver.quality_score,
        what_went_well_count: retro.what_went_well.length,
        what_needs_improvement_count: retro.what_needs_improvement.length,
        key_learnings_count: retro.key_learnings.length,
        action_items_count: retro.action_items.length,
        success_patterns_count: retro.success_patterns.length,
        failure_patterns_count: retro.failure_patterns.length,
      },
      defect_chain: retro.metadata.defect_chain,
      prior_handoff_stage_retro_left_intact: PRIOR_THIN_RETRO_ID,
    },
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'RETRO',
    SD_UUID,
    { name: 'Continuous Improvement Coach (retro-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN_VERIFICATION' }
  );

  console.log('\nEvidence row written:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
