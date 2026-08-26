#!/usr/bin/env node
/**
 * One-off: TESTING sub-agent PROSPECTIVE review of the PRD for
 * SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B, gating the PLAN-TO-EXEC handoff.
 *
 * PLAN-phase review: this is a pre-implementation, high-stakes infrastructure SD
 * (a production DDL migration inserting a new UAT venture_stage and renumbering
 * stages 23-26 to 24-27, touching an irreversible go_live gate on live venture
 * data). No code exists yet for this SD's EXEC phase. This review evaluates
 * whether the 8 documented test_scenarios (TS-1..TS-8) adequately prove the 8
 * functional_requirements (FR-1..FR-8) / their acceptance_criteria BEFORE EXEC
 * writes any code -- it does not run tests against implementation.
 *
 * Every claim below is a direct cross-reference of the PRD's own test_scenarios,
 * acceptance_criteria, technical_requirements, and risks fields (read live from
 * product_requirements_v2 this session), not an inference from the SD's prose
 * description.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = 'aa05cf0d-254f-4f43-b30b-f935fcedbf21';
const SD_KEY = 'SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B';

const findings = [
  {
    id: 'no-up-migration-idempotency-scenario',
    severity: 'HIGH',
    summary: "No TS-1..TS-8 scenario, no technical_requirement, and no risks-array entry tests or even acknowledges UP-migration re-apply safety: what happens if the staged migration is run TWICE (e.g. the chairman-supervised apply ceremony is accidentally re-invoked, or a retried apply-migration.js call actually succeeded the first time). FR-2/TR-2 establish the DOWN block must be idempotent and the UP block reuses the 20260607 UPDATE...FROM CTE snapshot technique to avoid mid-walk stage_key collisions, but nothing in the PRD asserts what happens to a row already sitting at stage_number 24-27 if the UP block runs again -- the CTE technique as described (capture pre-apply snapshot, write each target row exactly once) gives no guarantee it detects an already-shifted state rather than shifting 24-27 to 25-28 a second time. On an irreversible go_live gate touching live venture data, this is the single most consequential untested failure mode: a double-apply corrupts stage numbering with no DOWN mirror capable of cleanly reversing a double-shift (the DOWN mirror is written against a single +1 shift, per TS-7).",
  },
  {
    id: 'fr2-ac2-down-idempotency-untested',
    severity: 'HIGH',
    summary: "FR-2 AC-2 explicitly requires: 'A DOWN block exists in the same file and is idempotent (re-running detects already-reverted state).' TS-7 ('DOWN mirror correctly reverts the renumber') only exercises ONE execution of the DOWN block after a single UP apply -- its given/when/then never re-runs the DOWN block a second time to confirm it detects the already-reverted state and no-ops/fails safely rather than erroring or, worse, shifting already-reverted rows further. This is a directly-named acceptance criterion (FR-2 AC-2's own idempotency clause) with zero covering test scenario among the 8 listed.",
  },
  {
    id: 'fr1-ac3-unit-simulated-drift-test-missing',
    severity: 'MEDIUM',
    summary: "FR-1 AC-3 states: 'A unit test simulates a changed function body and asserts the non-zero exit.' The only scenario mapped to FR-1 is TS-1, which is test_type='integration' and whose given/when/then describes running the precondition script 'against the live database at apply time' comparing live definitions to a committed baseline -- it never describes simulating a changed function body via a mock/stub, which is what AC-3 specifically demands (and which is exactly the kind of pure-logic, no-live-DB test that would survive a DB-tier skip). As written, TS-1 satisfies FR-1 AC-1/AC-2 but not AC-3's unit-test requirement.",
  },
  {
    id: 'fr7-writer-registry-zero-scenario-coverage',
    severity: 'HIGH',
    summary: "FR-7 (stage_key as primary identifier; the new UAT stage's writer(s) register in ventures_canonical_writer_policy()) has two acceptance criteria -- AC-1 (writer appears in the registry VALUES list) and AC-2 (an unregistered writer attempting to write the new UAT stage is rejected by aaa_enforce_canonical_stage_write / zzz_enforce_canonical_stage_write_final) -- and NEITHER is referenced by any of TS-1 through TS-8. This is a full functional requirement with a concrete, testable enforcement-trigger mechanism and zero named test scenario.",
  },
  {
    id: 'fr8-header-convention-zero-scenario-coverage',
    severity: 'MEDIUM',
    summary: "FR-8 (migration cites docs/audits/stage-21-26-census.md, carries an @approved-by: PENDING header, and is never invoked by any automated apply script during this SD's own EXEC phase) has two acceptance criteria and no covering TS. These are cheap, static, file-content checks (grep the migration header for the census path and the PENDING marker; grep the EXEC-phase automation for any auto-invocation of the chairman-gated file) that cost little to add but are presently unlisted -- meaning nothing in the documented test plan actually verifies this SD's own core safety promise (staged, never auto-applied) beyond code review.",
  },
  {
    id: 'fr4-ac3-no-update-statement-static-check-untested',
    severity: 'MEDIUM',
    summary: "FR-4 AC-3 requires: 'eva_stage_gate_attempts.stage_number and venture_stage_transitions.from_stage/to_stage are never UPDATEd by this SD's own migration -- verified by the migration file containing no UPDATE statement against either table.' TS-4 covers the shim's READ-time translation logic (a different AC), but no scenario maps to this specific static-analysis assertion on the migration file's own SQL text. Given FR-4's description explicitly calls out that these two tables 'must never be renumbered in place -- only read through the shim,' the absence of a scenario that would catch a regression (an EXEC author accidentally adding an UPDATE against either table) is a concrete, citable gap.",
  },
  {
    id: 'ts6-refusal-mechanism-underspecified-vs-ts2',
    severity: 'MEDIUM',
    summary: "TS-2's own 'then' clause names its hard-failure mechanism explicitly inline: 'the migration refuses to apply (RAISE EXCEPTION)' -- unambiguous, non-ignorable. TS-6's 'then' clause reads only 'the classifier flags this as REAL and the apply script refuses to proceed without an explicit override,' with no mechanism named in the scenario itself (FR-6 AC-2 separately says '(non-zero exit)', but TS-6 does not inherit that wording). As specified, a test written literally to TS-6's own text could pass against an implementation that merely logs a warning and returns a boolean the caller ignores in a non-strict mode, since 'refuses to proceed' is not pinned to a process exit code or thrown exception the way TS-2 is. TS-6 should be reworded to explicitly assert on exit code / thrown error, matching TS-2's precision.",
  },
  {
    id: 'ts2-ts6-stub-ambiguity-plus-db-tier-skip-exposure',
    severity: 'HIGH',
    summary: "TS-2 and TS-6 are both labeled test_type='unit' but their 'given' clauses describe 'a stubbed venture_stage_transitions row' and 'a stubbed ventures row' respectively, without specifying whether the stub is a mocked DB client (true no-DB unit test) or an actual row inserted into a live database (which would make these integration tests in substance despite the 'unit' label). This matters concretely: of the 8 scenarios, only TS-5 (grep-based cross-repo constant check) and TS-8 (literal-check/import grep) are unambiguously pure-logic with zero DB dependency. TS-1, TS-3, TS-4, and TS-7 are explicitly test_type='integration' and require a live database connection to exercise the migration's actual DDL or query pg_proc -- and these four carry the highest-consequence invariants in the entire SD (mechanism drift, gate-semantics data integrity across the renumber, historical-row translation correctness, and DOWN-mirror correctness). Per this repo's known production-only DB-tier gate (the same situation already observed on sibling Child A), these four are the tests most likely to SKIP in ordinary CI runs. If TS-2/TS-6's 'stubbed row' also turns out to require a live DB connection at EXEC time, then 6 of 8 scenarios -- including every scenario that verifies actual data correctness under the renumber -- would have zero pure-logic fallback coverage when the DB tier is unavailable, leaving only TS-5 and TS-8 (source-file grep checks) as tests capable of running unconditionally.",
  },
  {
    id: 'no-production-verification-target-defined',
    severity: 'LOW',
    summary: "TS-3 and TS-7 each explicitly scope their DDL-applying step to '(in a non-production verification run)' inline in the scenario text -- this satisfies the letter of the requirement that these never run against literal production. However, the PRD does not define what concrete instance 'non-production verification run' resolves to (a scratch schema in the same Supabase project, an isolated branch/project, or a local ephemeral Postgres seeded from a schema dump). Given production and the two consuming repos apparently share one physical database in this stack, EXEC needs an explicit, named verification target before TS-3/TS-7 can be executed safely -- otherwise 'non-production verification run' is a label EXEC has to interpret rather than a concrete, reviewed target.",
  },
  {
    id: 'ts2-hard-failure-mechanism-explicit-positive',
    severity: 'INFO',
    summary: "POSITIVE: TS-2's scenario text names its own hard-failure mechanism inline ('RAISE EXCEPTION'), matching FR-2 AC-1 verbatim. This is the clearest-specified refusal test of the eight and should be the template TS-6 is reworded to match.",
  },
  {
    id: 'ts3-ts7-nonprod-scoping-explicit-positive',
    severity: 'INFO',
    summary: "POSITIVE: both DDL-applying scenarios (TS-3, TS-7) explicitly state '(in a non-production verification run)' in their own scenario text rather than leaving it to be inferred from FR-8's staged/chairman-gated framing elsewhere in the PRD. This is exactly the kind of explicit scoping the review was asked to check for, and it is present.",
  },
];

const warnings = [
  "Idempotency and partial/failed-prior-apply recovery are absent from this PRD's risks array entirely (all 4 listed risks concern mechanism drift, mid-transition corruption, cross-repo desync, and a real venture appearing at a shifted stage -- none concern re-apply or partial-apply recovery). For a migration this consequential, that omission from the risk register is itself notable, independent of the missing test coverage.",
  "Two full functional requirements (FR-7 writer-registry enforcement, FR-8 census-citation/chairman-gated header convention) have zero test_scenarios mapped to them at all. Both are cheap to test (a registry VALUES-list grep/query plus a trigger-rejection assertion for FR-7; static header/automation greps for FR-8) and their absence is a coverage gap, not a design gap -- these FRs are themselves well-specified.",
  "The 4 integration-tier scenarios (TS-1, TS-3, TS-4, TS-7) carry the SD's highest-consequence invariants and are also the scenarios most likely to skip under this repo's production-only DB-tier gate. Unlike the sibling Child A situation (same DB-tier constraint, referenced in this review's task brief), this PRD does not document a mitigation (e.g., a pure-logic proxy test, a fixture-based no-DB simulation of the CTE UPDATE, or an explicit VITEST_DB_ALLOW_REF-scoped non-production ref) for what still gives signal when those 4 tests skip.",
];

const recommendations = [
  "ADD a TS-9 (or extend TS-3) covering UP-migration re-apply: run the staged migration's UP block twice in the same non-production verification run and assert either (a) the second run is a safe no-op that detects already-shifted stage_number/stage_key state and exits cleanly without re-shifting, or (b) the second run hard-fails (RAISE EXCEPTION) rather than silently double-renumbering. Given the DOWN mirror is written against a single +1 shift (per TS-7), a double-apply with no detection would leave the DOWN block unable to cleanly restore state -- this is the highest-priority addition given the irreversible-gate stakes.",
  "EXTEND TS-7 to re-run the DOWN block a second time (after the first DOWN has already reverted state) and assert it detects the already-reverted condition and no-ops/exits cleanly, directly closing FR-2 AC-2's explicit idempotency clause, which is currently unlisted by any scenario.",
  "REWORD TS-1 (or add a companion TS-1b) as an explicit unit test that mocks/stubs a changed pg_proc function body and asserts a non-zero exit, to satisfy FR-1 AC-3's own wording ('A unit test simulates a changed function body') rather than relying solely on the live-database integration check.",
  "ADD test scenarios for FR-7 (writer registered in ventures_canonical_writer_policy()'s registry CTE; an unregistered writer's write attempt is rejected by aaa_enforce_canonical_stage_write / zzz_enforce_canonical_stage_write_final) and FR-8 (migration header cites docs/audits/stage-21-26-census.md and carries @approved-by: PENDING; no EXEC-phase automation invokes it). Both are static/cheap checks currently missing entirely from the 8-scenario set.",
  "ADD a static-content test for FR-4 AC-3: assert the migration file's own SQL text contains no UPDATE statement against eva_stage_gate_attempts or venture_stage_transitions, so a future EXEC-time regression (an author accidentally renumbering those tables in place instead of only reading through the shim) fails a test rather than shipping silently.",
  "REWORD TS-6's 'then' clause to explicitly assert a non-zero exit code / thrown exception, matching TS-2's precision ('RAISE EXCEPTION') rather than the looser 'refuses to proceed,' which a warn-and-continue implementation could satisfy without failing the test.",
  "CLARIFY, for TS-2 and TS-6, whether 'stubbed row' means a fully mocked DB client (true zero-DB unit test) or an inserted row in a live test database. If EXEC implements these against a live DB, relabel test_type to 'integration' and add genuinely mocked companion unit tests so at least the refusal LOGIC (not just the live-DB read) has pure-logic coverage that survives a DB-tier skip.",
  "NAME the concrete non-production verification target for TS-3/TS-7 (e.g. a specific Supabase branch/project, or a local ephemeral Postgres seeded from database/schema-reference-snapshot.json) before EXEC begins, so 'non-production verification run' is a reviewed, specific target rather than an EXEC-time judgment call on a migration this consequential.",
];

const summary = "PROSPECTIVE (PLAN-phase) TESTING review of the PRD for SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B, gating PLAN-TO-EXEC. This is a pre-implementation review of the documented test strategy only -- no code exists yet for this migration, which inserts a new UAT venture_stage and renumbers stage_number 23-26 to 24-27, touching an irreversible go_live gate on live venture data. Cross-referenced all 8 functional_requirements (FR-1..FR-8) and their acceptance_criteria against all 8 test_scenarios (TS-1..TS-8) directly from the live PRD row, not from the SD's prose description. RESULT: the 8 scenarios cover the happy path and the two most obviously named refusal conditions (TS-2 stage-quiescent freeze, TS-6 parked-venture classifier) reasonably well, and TS-2 in particular is precisely specified as a hard failure (RAISE EXCEPTION named inline). TS-3 and TS-7, the two scenarios that require actually applying DDL, both explicitly and correctly scope themselves to a 'non-production verification run.' However, several concrete, citable gaps remain given the stakes: (1) UP-migration re-apply/idempotency is untested and unmentioned anywhere in the PRD -- including its own risks array -- despite being the single most realistic real-world failure mode for a chairman-supervised, manually-triggered apply ceremony; (2) FR-2 AC-2's explicit DOWN-block idempotency requirement ('re-running detects already-reverted state') has zero covering scenario -- TS-7 only exercises one DOWN execution; (3) FR-1 AC-3 explicitly asks for a unit test simulating a changed function body, but the only mapped scenario (TS-1) is integration-only and describes checking live state, not simulating drift; (4) two entire functional requirements, FR-7 (writer-registry enforcement) and FR-8 (census citation / chairman-gated header convention), have zero scenarios mapped to them across all 8 listed; (5) FR-4 AC-3's static no-UPDATE-statement check on the migration file itself is untested; (6) TS-6's refusal mechanism is worded more loosely than TS-2's, risking acceptance of a warn-and-continue implementation; and (7) exactly the 4 integration-tier scenarios (TS-1, TS-3, TS-4, TS-7) carry the highest-consequence data-integrity invariants and are the ones most likely to skip under this repo's known production-only DB-tier gate (the same constraint already observed on sibling Child A), with no documented pure-logic fallback for when they do. None of these gaps make the design untestable in principle -- every one is closable by adding or rewording a test scenario, and PLAN can apply all of them without re-scoping the migration's architecture -- but shipping the current 8-scenario set to EXEC unamended would leave a genuinely irreversible production DDL change under-verified on exactly the failure modes (double-apply, DOWN re-run safety, and DB-tier-skip blind spots on the core data-integrity checks) most likely to matter in practice.";

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });

  let results = {
    verdict: 'WARNING',
    confidence_score: 82,
    findings,
    warnings,
    recommendations,
    summary,
    justification: "WARNING rather than CONDITIONAL_PASS because the count and nature of the gaps exceed routine PRD polish: two entire functional requirements (FR-7, FR-8) have zero mapped test scenarios among the 8 listed, an explicit written acceptance criterion (FR-2 AC-2's DOWN-block idempotency) is completely untested, and the single most realistic real-world failure mode for a chairman-supervised manual apply ceremony -- running the UP migration twice -- is not tested, not mentioned in technical_requirements, and not even present in the PRD's own risks array. On an irreversible go_live gate touching live venture data, that combination is more than a documentation nit. WARNING rather than FAIL/BLOCKED because none of these gaps reflect an untestable or architecturally unsound design: every gap is closable by adding or rewording a test scenario against mechanisms the PRD already correctly describes (RAISE EXCEPTION precondition checks, the 20260607 CTE snapshot technique, the translate-at-read shim, the chairman-gated staging convention), FR-8's own core safety promise (staged, never auto-applied) is architecturally sound even though untested, and the scenarios that do exist (especially TS-2's explicit hard-failure wording and TS-3/TS-7's explicit non-production scoping) show the PRD author was already applying the right rigor in places. Confidence 82: every finding is a direct, verifiable cross-reference against the PRD's own live test_scenarios/acceptance_criteria/technical_requirements/risks fields (quoted inline above), not an inference from the SD description; the residual uncertainty is that TS-2/TS-6's 'stubbed row' semantics and the concrete shape of the non-production verification target are genuinely ambiguous as documented and could resolve more or less favorably once EXEC specifies them.",
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'PLAN',
      review_type: 'prospective_prd_testability_review_pre_implementation',
      prd_id: 'PRD-SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B',
      review_method: 'Direct cross-reference of the PRD row\'s own test_scenarios (TS-1..TS-8), acceptance_criteria (nested under each FR-1..FR-8), technical_requirements (TR-1..TR-4), and risks arrays, fetched live from product_requirements_v2. No code was read or executed -- this SD is pre-implementation (PLAN phase); this is a documentation-level review of the test STRATEGY only.',
      fr_ts_coverage_matrix: {
        'FR-1 AC-1/AC-2 (drift check exits non-zero)': 'covered by TS-1 (integration, live-DB)',
        'FR-1 AC-3 (unit test simulates changed function body)': 'GAP -- TS-1 is integration/live-DB only, does not describe simulating drift via mock',
        'FR-2 AC-1 (quiescent freeze RAISE EXCEPTION)': 'covered precisely by TS-2 (mechanism named inline)',
        'FR-2 AC-2 (DOWN block idempotent, re-running detects already-reverted)': 'GAP -- TS-7 only runs DOWN once',
        'FR-2 AC-3 (post-apply readback assertions)': 'covered by TS-3',
        'FR-3 AC-1/AC-2/AC-3 (gate_type/is_irreversible invariance)': 'covered by TS-3',
        'FR-4 AC-1/AC-2 (epoch marker, translate-at-read shim vs real 20260322 row)': 'covered by TS-4',
        'FR-4 AC-3 (migration file contains no UPDATE against the 2 historical tables)': 'GAP -- no scenario is a static check of the migration file text',
        'FR-5 AC-1/AC-2/AC-3 (cross-repo constants updated, zero remaining refs)': 'covered by TS-5',
        'FR-6 AC-1/AC-2/AC-3 (parked-venture classifier blocks real ventures)': 'covered by TS-6, but refusal mechanism worded more loosely than TS-2 (no explicit non-zero-exit/exception wording in the scenario itself)',
        'FR-7 AC-1/AC-2 (writer registry, enforcement-trigger rejection)': 'GAP -- zero scenarios mapped',
        'FR-8 AC-1/AC-2 (census citation, @approved-by:PENDING header, never auto-applied)': 'GAP -- zero scenarios mapped',
        'UP-migration re-apply/idempotency (not an explicit AC anywhere)': 'GAP -- untested, unmentioned in TRs, absent from risks array entirely',
        'lib/eva/stage-execution-worker.js literal check / dynamic import update': 'covered by TS-8',
      },
      test_type_mix: {
        counted_as_labeled: '4 unit (TS-2, TS-5, TS-6, TS-8) / 4 integration (TS-1, TS-3, TS-4, TS-7)',
        unambiguously_pure_logic_no_db: 'TS-5 (source-file grep), TS-8 (literal-check/import grep)',
        ambiguous_unit_label: "TS-2 and TS-6 describe 'stubbed' rows without specifying mocked-client vs live-DB-inserted-row semantics",
        highest_consequence_tests_are_integration_tier: 'TS-1 (mechanism drift), TS-3 (gate-semantics data integrity), TS-4 (historical shim correctness), TS-7 (DOWN-mirror correctness) -- all integration, all likely to skip under this repo\'s production-only DB-tier gate per the sibling Child A precedent cited in this review\'s task brief',
      },
      nonproduction_scoping_check: {
        'TS-3': "explicit inline: 'The renumber migration applies (in a non-production verification run)'",
        'TS-7': "explicit inline: 'The DOWN block is executed' against 'The migration has been applied (in a non-production verification run)'",
        gap: 'neither scenario nor any TR names the concrete verification target instance (branch/project/local ephemeral DB)',
      },
    },
    phase: 'PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_ID,
    { name: 'Enhanced QA Engineering Director v2.4.0' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN' }
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

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
