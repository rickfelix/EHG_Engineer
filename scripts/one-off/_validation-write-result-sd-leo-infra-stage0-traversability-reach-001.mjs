#!/usr/bin/env node
/**
 * Write VALIDATION (Principal Systems Analyst) PLAN_VERIFICATION-phase verdict
 * for SD-LEO-INFRA-STAGE0-TRAVERSABILITY-REACH-001 ahead of its PLAN-TO-LEAD handoff.
 *
 * CH-6: the Stage-0 traversability gate was invoked on only 1 of 4 entry paths
 * (discovery_mode) and required_capabilities was prompted in only 1 of 5 discovery
 * strategies (trend_scanner). This SD extends REACH (not gate mechanism): FR-1
 * (capabilities in the 4 silent strategies), FR-2 (2 of 3 ungated paths sourced),
 * FR-3 (gate invoked on all 4 paths), FR-4 (ALL-PATHS enumeration tests),
 * TR-1 (no fabricated capabilities for blueprint_browse), TR-2 (gate file unchanged).
 *
 * GATE 4 (PLAN Verification): independent implementation validation against the
 * PRD's 4 FRs + 2 TRs, read at source (not from summary), plus an INDEPENDENT
 * mutation on competitor_teardown — a path neither the implementer (blueprint_browse)
 * nor the TESTING agent (venture-reseeding) mutated. Corroborates the TESTING PASS.
 *
 * Uses the canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict) + canonical storage (lib/sub-agent-executor/
 * results-storage.js storeSubAgentResults) rather than a hand-rolled INSERT,
 * per CLAUDE.md prologue rule 11. The PLAN-TO-LEAD subagent-evidence-gate matches
 * on sd_id + created_at + sub_agent_code (NOT the `phase` column), so `phase` is
 * informational and set to the SD's current_phase = 'PLAN_VERIFICATION'.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '537227ac-8954-4e53-b9c4-67e4d13858f3';
const SD_KEY = 'SD-LEO-INFRA-STAGE0-TRAVERSABILITY-REACH-001';

const findings = [
  {
    id: 'V1-fr1-strategy-reach-source-verified',
    severity: 'INFO',
    summary: 'FR-1 source-verified in lib/eva/stage-zero/paths/discovery-mode.js (read directly, not from summary). runDemocratizationFinder (prompt instruction lines 408 + JSON schema field line 411), runCapabilityOverhang (instruction 465 + schema 468), and runSimpleVentureFinder (instruction 548 + schema 551) each now include a required_capabilities instruction and JSON-schema field mirroring runTrendScanner\x27s pre-existing wording (line 330/333) verbatim in intent (\x22EVERY factory/external capability ... form_factor|integration|channel|ops ... factory hard-checks these\x22). runNurseryReeval does NOT re-prompt: its prompt (lines 605-636) has no required_capabilities field; instead it carries forward original?.metadata?.required_capabilities from the parked record (lines 650-660), spreading it only when present (...(requiredCapabilities ? {required_capabilities} : {})). That is exactly FR-1\x27s \x22carry forward if present, do not fabricate\x22 contract.'
  },
  {
    id: 'V2-fr2-hybrid-path-sourcing-verified',
    severity: 'INFO',
    summary: 'FR-2 source-verified. competitor-teardown.js: deconstructToFirstPrinciples() (the venture-concept-producing prompt, not the per-competitor analyzeCompetitor prompt) now asks for \x22EVERY factory/external capability ...\x22 (instruction lines 320-324) with the required_capabilities schema field (line 336); it is threaded into BOTH the gateCandidate (line 136) and the final createPathOutput() (line 163). venture-reseeding.js: carries forward sz.required_capabilities where sz = source.metadata?.stage_zero (line 53 -> line 72), threaded into gateCandidate (line 83) and conditionally into createPathOutput (line 113: ...(requiredCapabilities ? {required_capabilities} : {})) — best-effort propagation, not fabrication, exactly per FR-2. Neither path null-fabricates when the source is absent.'
  },
  {
    id: 'V3-fr3-gate-invocation-all-4-paths-verified',
    severity: 'INFO',
    summary: 'FR-3 source-verified across all 3 previously-ungated paths. Each imports loadCapabilityEnvelope+checkTraversability+parkFailedCandidate from ../traversability-gate.js (competitor-teardown.js:33, venture-reseeding.js:17, blueprint-browse.js:23) and invokes the gate BEFORE its final createPathOutput return: competitor-teardown Step 3.5 (loadCapabilityEnvelope line 138 -> checkTraversability([gateCandidate],envelope) 139 -> park+return null 140-147, before createPathOutput at 150); venture-reseeding Step 3.5 (85 -> 86 -> 87-94, before createPathOutput at 96); blueprint-browse Step 4.5 (101 -> 102 -> 103-110, before createPathOutput at 113). Each wraps its SINGLE candidate in a 1-element array and returns null on failure (each path\x27s existing \x22no result\x22 convention). discovery_mode\x27s own gate (Step 3.5, lines 135-162) is unchanged (FR-3 AC4). CRITICAL fail-closed check: in all 3 files loadCapabilityEnvelope sits OUTSIDE any try/catch — the only try/catch wraps parkFailedCandidate (catching parkErr, not the envelope load) — so EnvelopeUnavailableError propagates unhandled. Confirmed empirically by the 3 fail-closed tests AND my own mutation (V5).'
  },
  {
    id: 'V4-fr4-enumeration-tests-verified',
    severity: 'INFO',
    summary: 'FR-4 verified by reading tests directly. tests/unit/eva/stage-zero/paths/traversability-reach.test.js has 3 explicit describe blocks (blueprint_browse, competitor_teardown, seeded_from_venture) — not one representative case. Each proves gate invocation via supabase._calledTables.toContain(\x27v_unified_capabilities\x27). competitor_teardown + seeded_from_venture have full pass/fail-park/fail-closed triads (park asserts parkedRow.source_ref.missing[0].name); blueprint_browse correctly has pass + fail-closed ONLY (no park case — opportunity_blueprints has no capability source per TR-1, so the undeclared candidate takes the honest auto-pass). The 4 discovery strategies are enumerated in discovery-mode.test.js\x27s new describe block (test.each over trend_scanner/democratization_finder/capability_overhang/simple_venture asserting the prompt contains required_capabilities) plus two nursery_reeval tests (carry-forward-present -> undeclared===0; omit-when-absent -> required_capabilities undefined + undeclared===1). All 5 strategies + all 4 paths are explicitly enumerated; the discovery_mode path\x27s gate invocation is additionally covered by the pre-existing traversability-gate.test.js integration block and the nursery traversability-metadata assertions.'
  },
  {
    id: 'V5-independent-mutation-competitor-teardown-non-tautology',
    severity: 'INFO',
    summary: 'INDEPENDENT non-tautology proof on competitor_teardown — a path NEITHER the implementer (who manually verified blueprint_browse) NOR the TESTING agent (who mutated venture-reseeding) had mutated, maximizing adversarial coverage so all 3 newly-gated paths are now mutation-covered by distinct verifiers. Backed up competitor-teardown.js to a scratchpad copy first (SHA c0c39b2c...) to avoid the git-checkout-reverts-to-pre-SD-HEAD hazard on UNCOMMITTED working-tree changes. Neutered 2 lines (loadCapabilityEnvelope -> {count:0}; checkTraversability -> {failed:[],passed:[gateCandidate]}) and re-ran the competitor_teardown block: all 3 tests FAILED exactly as designed — pass case (v_unified_capabilities never queried -> _calledTables assertion fails), fail/park case (returns a full PathOutput instead of null, no park), fail-closed case (resolves with a PathOutput instead of rejecting with EnvelopeUnavailableError, confirmed by the diff dump). Restored byte-for-byte from the backup (post-restore SHA c0c39b2c... matches), full 706-test suite GREEN again, git diff --stat shows the SD work intact (36 ins / 1 del). The reach tests are genuinely coupled to the gate, not tautological.'
  },
  {
    id: 'V6-tr1-tr2-honored',
    severity: 'INFO',
    summary: 'TR-1 HONORED: blueprint-browse.js invents NO capability heuristic. Its gateCandidate (lines 95-100) contains name/problem_statement/solution/target_market only — NO required_capabilities field and no fabricated/derived capability logic anywhere in the file; the file only adds the gate-invocation block (Step 4.5) so an undeclared candidate takes the gate\x27s existing honest no_requirements_declared auto-pass. TR-2 HONORED: git diff (and git diff HEAD) on lib/eva/stage-zero/traversability-gate.js is EMPTY — the file is absent from git status; the last commit touching it is fc77f229 (SD-LEO-INFRA-STAGE0-TRAVERSABILITY-GATE-001, the ORIGINAL gate SD), NOT this REACH SD. No changes to checkTraversability/loadCapabilityEnvelope/parkFailedCandidate. This PRD adds call sites + prompt fields only, exactly as scoped.'
  },
  {
    id: 'V7-scope-and-duplicate-check',
    severity: 'INFO',
    summary: 'Independent scope/duplicate check. Full change set (git status): 4 modified path impls (blueprint-browse, competitor-teardown, discovery-mode, venture-reseeding), 5 modified/added test files (4 path test files + stage-zero.test.js + the new traversability-reach.test.js). Zero source files outside lib/eva/stage-zero/paths/ touched; the gate engine, the v_unified_capabilities view, and the venture_nursery park-write shape are all untouched. No duplicate/forked gate implementation introduced — all 4 paths import the SINGLE existing traversability-gate.js. Delivered == approved (reach-only extension). No scope creep.'
  },
  {
    id: 'V8-preexisting-nursery-drift-out-of-scope-note',
    severity: 'LOW',
    summary: 'Non-blocking observation for the record (NOT a gap in this SD). discovery-mode.js:576-581 documents PRE-EXISTING latent schema drift: runNurseryReeval\x27s live SELECT reads venture_nursery columns (name, problem_statement, solution, ...) that do not exist on the live table (actual: brief_id, description, maturity_level, ...), so nursery_reeval errors at runtime and is currently DEAD in production — explicitly \x22NOT introduced or fixed here\x22 and routed to the coordinator. Consequence: the FR-1 nursery carry-forward is CORRECT in code (it reads original?.metadata?.required_capabilities, and metadata IS in the SELECT list) and is proven by the unit tests (which supply mocked nursery rows), but it will not actually execute in production until that unrelated nursery-seam defect is fixed. This is out of scope for CH-6 (traversability REACH, not nursery liveness) and does not block the handoff — flagged only so the completed record is honest about the runtime reachability of one of the five strategy carry-forwards.'
  },
  {
    id: 'V9-fr4-enumeration-spread-across-two-files-note',
    severity: 'LOW',
    summary: 'Non-blocking wording note. FR-4 AC1 offers \x22A single test file (or clearly-grouped describe blocks)\x22 — the enumeration is delivered as clearly-grouped describe blocks across TWO files (traversability-reach.test.js for the 3 newly-gated paths; discovery-mode.test.js\x27s new describe block for the 5 strategies), with the discovery_mode path\x27s gate coverage relying on the pre-existing traversability-gate.test.js integration block. This satisfies the \x22clearly-grouped describe blocks\x22 alternative the AC explicitly allows; it is simply not a single physical file. No change required.'
  }
];

const warnings = [
  'PRE-EXISTING (out of scope): nursery_reeval\x27s live venture_nursery SELECT queries non-existent columns (documented in-code at discovery-mode.js:576-581, routed to coordinator), so the FR-1 nursery carry-forward is correct-in-code + unit-proven but does not execute in production until that separate nursery-seam defect is fixed. Does not block this handoff.',
];

const recommendations = [
  'Allow PLAN-TO-LEAD handoff to proceed: all 4 FRs and both TRs are satisfied at source + behavior level, the reach tests are mutation-proven non-tautological (independently on competitor_teardown, a path distinct from the implementer\x27s and TESTING\x27s), the full 706-test suite is green, and the gate engine file is provably untouched (TR-2).',
  'No new sub-agents required beyond the PLAN-TO-LEAD blocking set (RETRO). This VALIDATION row is supplementary GATE-4 implementation-validation evidence, independently corroborating the TESTING PASS on a different mutation path.',
  'No E2E required: server-side selection-path invariant (traversability gate reach on 3 previously-ungated Stage-0 entry paths), fully exercised at unit level against the REAL traversability-gate.js imports (gate not mocked; only the Supabase query surface + LLM client are). No new UI/route surface.',
];

const summary = 'PASS (confidence 95). GATE 4 (PLAN Verification) implementation validation for the Stage-0 traversability REACH fix (CH-6). Read all 4 path source files + both new/extended test files DIRECTLY (not from summary). FR-1: required_capabilities added to the democratization_finder/capability_overhang/simple_venture prompts (discovery-mode.js:408/465/548) mirroring trend_scanner\x27s pre-existing field; nursery_reeval carries it forward from the parked record\x27s metadata (650-660), not a re-prompt. FR-2: competitor_teardown sources it in deconstructToFirstPrinciples (prompt 320-324 + schema 336) and threads it to createPathOutput (163); seeded_from_venture carries forward source.metadata.stage_zero.required_capabilities (72 -> 113), best-effort not fabricated. FR-3: all 3 previously-ungated paths now import + invoke loadCapabilityEnvelope->checkTraversability->parkFailedCandidate before their final createPathOutput return, wrapping the single candidate in a 1-element array and returning null on failure, mirroring discovery-mode.js; loadCapabilityEnvelope sits OUTSIDE any try/catch in all 3 so EnvelopeUnavailableError propagates fail-closed (only parkFailedCandidate is try-wrapped). FR-4: traversability-reach.test.js enumerates all 3 newly-gated paths (pass/fail-park/fail-closed; blueprint_browse correctly no-park per TR-1) and discovery-mode.test.js\x27s new block enumerates all 5 strategies (test.each prompt-inclusion for 4 + nursery carry-forward-present/omit-when-absent) — explicit, not one representative case. TR-1 honored: blueprint-browse.js has NO fabricated capability heuristic, gate-invocation only. TR-2 honored: git diff on traversability-gate.js is EMPTY (last commit is the original GATE SD, not this REACH SD). Independent mutation on competitor_teardown (a path neither the implementer nor TESTING had mutated) -> all 3 tests FAIL (envelope never queried / returns PathOutput not null / resolves instead of rejecting), restored byte-for-byte (SHA verified), suite green post-restore -> non-tautological. Full suite 46 files / 706 tests pass, green pre- and post-mutation-restore. Two LOW non-blocking notes: (V8) a PRE-EXISTING out-of-scope nursery_reeval schema-drift defect means that one strategy\x27s carry-forward is correct-in-code + unit-proven but dead in production until a separate seam fix; (V9) the FR-4 enumeration is delivered as clearly-grouped describe blocks across two files, which the AC explicitly permits. No blocking gaps; no rubber stamp.';

const justification = [
  'PASS (confidence 95) - SD-LEO-INFRA-STAGE0-TRAVERSABILITY-REACH-001 implementation is validated for PLAN-TO-LEAD.',
  '',
  'GATE 4 (PLAN Verification) checklist:',
  '- Implementation Validation: code matches approved PRD scope. All 4 FRs + 2 TRs verified at source (read all 4 path files + both test files directly). VERIFIED.',
  '- No Scope Creep: change set is exactly 4 path impls + 5 test files (4 path tests + stage-zero.test.js + new traversability-reach.test.js); nothing outside lib/eva/stage-zero/paths/. Delivered == approved. VERIFIED.',
  '- Integration Validation: all 4 paths import the SINGLE existing traversability-gate.js; no forked/duplicate gate. Fail-closed contract (EnvelopeUnavailableError propagates) mirrors discovery_mode. VERIFIED.',
  '- Duplicate/Overlap (independent): one gate engine, imported by all callers; gate file untouched (TR-2). VERIFIED.',
  '',
  'EVIDENCE:',
  '1. FR-1 source: required_capabilities in democratization/capability_overhang/simple_venture prompts (discovery-mode.js:408/465/548); nursery carry-forward from original.metadata.required_capabilities (650-660), no re-prompt.',
  '2. FR-2 source: competitor_teardown deconstructToFirstPrinciples prompt (320-324 + schema 336) -> gateCandidate (136) + createPathOutput (163); venture-reseeding sz.required_capabilities (53->72) -> gateCandidate (83) + createPathOutput (113), best-effort.',
  '3. FR-3 source: gate blocks in competitor-teardown (138-147->150), venture-reseeding (85-94->96), blueprint-browse (101-110->113); single candidate wrapped in 1-element array, returns null on failure; loadCapabilityEnvelope outside try/catch -> EnvelopeUnavailableError propagates.',
  '4. FR-4 tests: traversability-reach.test.js (3 paths, pass/fail-park/fail-closed; blueprint no-park per TR-1) + discovery-mode.test.js new block (5 strategies enumerated). All 4 paths have gate-invocation assertions (_calledTables / traversability metadata).',
  '5. TR-1: blueprint-browse gateCandidate has no required_capabilities, no heuristic. TR-2: git diff on traversability-gate.js EMPTY; last commit = original GATE SD fc77f229.',
  '6. Independent mutation (competitor_teardown, distinct from implementer\x27s blueprint_browse and TESTING\x27s venture-reseeding): neuter gate -> all 3 tests FAIL; restored byte-for-byte (SHA verified); 706/706 green post-restore.',
  '',
  'RATIONALE FOR PASS:',
  'The reach fix is minimal (call sites + prompt fields only), correct at source and behavior, mutation-proven on a path independent of both prior verifiers, and free of duplicate/overlapping implementation with the gate engine provably untouched. The two open items are LOW non-blocking record notes: a PRE-EXISTING out-of-scope nursery schema-drift (already documented in-code + routed to the coordinator) that makes one strategy\x27s carry-forward dead-in-prod until a separate fix, and a purely cosmetic FR-4 two-file enumeration split that the AC explicitly permits. Neither warrants blocking the handoff. Confidence 95 reflects full functional confidence with two honest non-blocking observations for the completed record.'
].join('\n');

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 95,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [],
    metadata: {
      gate: 'GATE_4_PLAN_VERIFICATION',
      validation_type: 'implementation_validation_and_duplicate_check',
      files_read_directly: [
        'lib/eva/stage-zero/paths/discovery-mode.js',
        'lib/eva/stage-zero/paths/competitor-teardown.js',
        'lib/eva/stage-zero/paths/venture-reseeding.js',
        'lib/eva/stage-zero/paths/blueprint-browse.js',
        'tests/unit/eva/stage-zero/paths/traversability-reach.test.js',
        'tests/unit/eva/stage-zero/paths/discovery-mode.test.js (new describe block)',
      ],
      fr_coverage: {
        'FR-1': 'PASS — required_capabilities in democratization(408)/capability_overhang(465)/simple_venture(548) prompts; nursery carry-forward (650-660), not re-prompt. trend_scanner pre-existing (330).',
        'FR-2': 'PASS — competitor_teardown deconstructToFirstPrinciples prompt (320-324+336) -> createPathOutput (163); seeded_from_venture carries sz.required_capabilities (53->72->113), best-effort.',
        'FR-3': 'PASS — gate invoked before final return in all 3 paths (competitor 138-147, venture-reseeding 85-94, blueprint 101-110); single candidate in 1-elem array; EnvelopeUnavailableError outside try/catch -> propagates.',
        'FR-4': 'PASS — traversability-reach.test.js enumerates 3 newly-gated paths (pass/fail-park/fail-closed; blueprint no-park per TR-1); discovery-mode.test.js new block enumerates all 5 strategies. Mutation-verifiable (V5).',
      },
      tr_coverage: {
        'TR-1': 'HONORED — blueprint-browse gateCandidate (95-100) has no required_capabilities, no fabricated/heuristic capability logic; gate-invocation only.',
        'TR-2': 'HONORED — git diff (and git diff HEAD) on lib/eva/stage-zero/traversability-gate.js EMPTY; last commit fc77f229 = original GATE SD, not this REACH SD.',
      },
      independent_mutation: {
        path_selected: 'competitor_teardown (competitor-teardown.js)',
        rationale: 'distinct from implementer-verified blueprint_browse AND TESTING-verified venture-reseeding -> all 3 newly-gated paths now mutation-covered by distinct verifiers',
        method: 'backed up to scratchpad (SHA c0c39b2c...) to avoid git-checkout-to-pre-SD-HEAD hazard on uncommitted work; neutered loadCapabilityEnvelope + checkTraversability (2 lines)',
        outcome: 'all 3 competitor_teardown tests FAILED (v_unified_capabilities never queried / returns PathOutput not null with no park / resolves instead of rejecting EnvelopeUnavailableError)',
        restore: 'byte-for-byte from backup; post-restore SHA c0c39b2c... matches; full 706-test suite green; git diff --stat shows SD work intact (36 ins / 1 del)',
        verdict: 'NON_TAUTOLOGICAL',
      },
      full_suite: {
        scope: 'tests/unit/eva/stage-zero/ + tests/unit/stage-zero.test.js + tests/unit/discovery-mode.test.js',
        files: 46,
        tests_total: 706,
        tests_passed: 706,
        tests_failed: 0,
        state: 'green pre- and post-mutation-restore',
      },
      change_set: {
        path_impls: [
          'lib/eva/stage-zero/paths/blueprint-browse.js',
          'lib/eva/stage-zero/paths/competitor-teardown.js',
          'lib/eva/stage-zero/paths/discovery-mode.js',
          'lib/eva/stage-zero/paths/venture-reseeding.js',
        ],
        test_files: [
          'tests/unit/eva/stage-zero/paths/blueprint-browse.test.js',
          'tests/unit/eva/stage-zero/paths/competitor-teardown.test.js',
          'tests/unit/eva/stage-zero/paths/discovery-mode.test.js',
          'tests/unit/eva/stage-zero/paths/venture-reseeding.test.js',
          'tests/unit/stage-zero.test.js',
          'tests/unit/eva/stage-zero/paths/traversability-reach.test.js (new)',
        ],
        gate_file_untouched: 'lib/eva/stage-zero/traversability-gate.js (absent from git status; TR-2)',
        scope_creep: 'none — reach-only extension, nothing outside lib/eva/stage-zero/paths/',
      },
      non_blocking_notes: [
        'V8/LOW: PRE-EXISTING out-of-scope nursery_reeval schema drift (discovery-mode.js:576-581, routed to coordinator) — FR-1 nursery carry-forward is correct-in-code + unit-proven but dead-in-prod until a separate seam fix.',
        'V9/LOW: FR-4 enumeration delivered as clearly-grouped describe blocks across two files, which AC1 explicitly permits; not a single physical file.',
      ],
      corroborates_testing_row: 'TESTING PASS (confidence 95, EXEC) — mutation on venture-reseeding; this VALIDATION independently mutated competitor_teardown',
      e2e_applicable: false,
      e2e_exemption_reason: 'server-side selection-path invariant (traversability gate reach on 3 previously-ungated Stage-0 entry paths); fully exercised at unit level against the REAL traversability-gate.js imports (gate not mocked; only Supabase query surface + LLM client). No new UI/route surface (reach-not-mechanism change).',
      model: 'Opus 4.8',
      model_id: 'claude-opus-4-8[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      checks_performed: {
        fr1_strategy_reach: '4 silent strategies now prompt (democratization/capability_overhang/simple_venture) or carry-forward (nursery) required_capabilities',
        fr2_hybrid_sourcing: 'competitor_teardown prompt-sourced + threaded to output; seeded_from_venture carries source metadata.stage_zero, best-effort',
        fr3_gate_all_paths: '3 previously-ungated paths invoke gate before final return; EnvelopeUnavailableError propagates fail-closed (outside try/catch)',
        fr4_enumeration_tests: 'all 5 strategies + all 4 paths explicitly enumerated across traversability-reach.test.js + discovery-mode.test.js new block',
        tr1_no_fabrication: 'blueprint-browse gate-invocation only, no capability heuristic',
        tr2_gate_untouched: 'git diff on traversability-gate.js empty; last commit is original GATE SD',
        independent_mutation: 'competitor_teardown gate neutered -> 3 tests FAIL; restored clean (SHA verified); non-tautological',
        scope_duplicate: 'single gate engine imported by all paths; no fork; delivered == approved',
      },
    },
    phase: 'PLAN_VERIFICATION',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_ID,
    { name: 'Principal Systems Analyst (validation-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN_VERIFICATION' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
