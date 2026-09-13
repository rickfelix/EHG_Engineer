import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD = 'fbbf9a6d-e079-4c22-9189-88336aae9a16';

const critical_issues = [
  "BLOCKER-1 (CRITICAL, NEW): The load-bearing premise of the pass-3 correction is FALSE on the target database, and has now been written into the PRD as established fact. Measured directly against the live DB (server_version 17.4) in an always-ROLLBACK transaction on a TEMP table: a bare \"IF OLD.metadata IS DISTINCT FROM NEW.metadata THEN\" inside a BEFORE INSERT OR UPDATE ... FOR EACH ROW trigger does NOT raise 'record \"old\" is not assigned yet' on INSERT. It executed cleanly and set its sentinel key. Mechanism: since PG 11, plpgsql_exec_trigger assigns BOTH the OLD and NEW record variables the table's tupdesc even when only one holds a tuple (explicitly so mixed-trigger-type expressions parse); on INSERT, OLD is an all-NULL row of the correct rowtype, so OLD.metadata evaluates to NULL rather than erroring. The \"record not assigned yet\" error is PG<=10 / statement-level-trigger behaviour. Consequences: (a) risks[0] -- the ONLY risk entry covering the SD's only shipping migration -- describes a failure mode that cannot occur, so pass-3's BLOCKER-2 ('the shipping migration has zero valid risk coverage') is NOT fixed; it recurred in a new form, a fictional-mechanism risk replacing a wrong-target risk. (b) The false claim is now asserted in 4 places: FR-3.description, FR-3.acceptance_criteria[0], system_architecture.data_flow, risks[0].risk, plus the content markdown mirror. (c) The supporting citation 'the exact failure mode already documented in that file's own QF-20260830-487 comment' is FALSE -- lib/uat/result-recorder.js:122's QF-20260830-487 comment documents a NOT-NULL constraint violation on run_id and says nothing about OLD or trigger semantics (verified by direct read). NOTE: the prescribed guard \"IF TG_OP = 'INSERT' OR OLD.metadata IS DISTINCT FROM NEW.metadata\" is still the RIGHT guard, but for a reason the PRD never states: on an INSERT where NEW.metadata IS NULL, the bare guard evaluates NULL IS DISTINCT FROM NULL = FALSE and skips the body, leaving control_pack_evaluated unset; the TG_OP='INSERT' OR form runs and correctly derives false. This is a correct instruction attached to a false reason -- keep the instruction, rewrite the rationale and risks[0] to the real mechanism.",

  "BLOCKER-2 (HIGH, NEW -- self-inflicted by the pass-3 correction): FR-3.acceptance_criteria[7] (AC-8) is UNSATISFIABLE as written. It requires 'A fixture UPDATE that changes an unrelated metadata sub-key (not control_pack_status) leaves control_pack_evaluated unchanged AND DOES NOT NEEDLESSLY RECOMPUTE -- confirms the OLD.metadata IS DISTINCT FROM NEW.metadata short-circuit actually short-circuits on the UPDATE branch.' Measured with a fire-counter column: changing an unrelated metadata sub-key makes the whole jsonb blob differ, so OLD.metadata IS DISTINCT FROM NEW.metadata is TRUE and the body DOES recompute (counter 1 -> 2). The guard short-circuits only when metadata is byte-identical (counter stayed 1 on an UPDATE that did not touch metadata at all). The AC conflates 'metadata unchanged' with 'control_pack_status unchanged'; the prescribed guard diffs the whole blob, not the sub-key. EXEC cannot pass this AC -- it will either block, or be 'satisfied' by a test asserting something weaker than the written text, which is a false-pass vector. Remedy (either): reword AC-8 to an UPDATE that does not touch metadata at all; or change the guard to diff NEW.metadata->'control_pack_status' IS DISTINCT FROM OLD.metadata->'control_pack_status', which would make the AC true as written and is arguably the better design. The recompute itself is idempotent and harmless -- the defect is the AC, not the trigger.",

  "BLOCKER-3 (MEDIUM-HIGH, NEW): The predicate TIGHTENING drifted -- two sections still specify the untightened predicate, exactly the fix-one-bullet/leave-the-rest pattern of passes 1-3. FR-3.requirement and FR-3.acceptance_criteria[0] now require 'all 4 required keys are PRESENT AND none equals not_attempted'. But system_architecture.components[0].responsibility still says 'true iff no required key equals not_attempted' (no presence requirement), and integration_operationalization.data_contracts[0].schema still says '(canonical derivation source -- true iff none equals not_attempted, which correctly counts a waiver as evaluated)'. An implementer reading either section would build the vacuous version that FR-3 AC-1 then fails. Both must be updated to the presence-plus-inequality form.",

  "BLOCKER-4 (MEDIUM, NEW): FR-3.requirement now internally contradicts FR-3.acceptance_criteria[0]. The requirement states the predicate mirrors 'lib/eva/uat-control-pack.js:206-226 allRequiredEvaluated EXACTLY'. Read at source (lines 206-227): missing = CONTROL_PACK_CONTROLS.filter(c => status[c] === 'not_attempted'); allRequiredEvaluated = missing.length === 0. On an ABSENT key, status[c] is undefined, which is !== 'not_attempted', so it is NOT counted missing and allRequiredEvaluated returns TRUE. The tightened trigger predicate (all 4 PRESENT) derives FALSE for that same input. The two diverge on precisely the case the tightening was introduced to defend against ('not defensive against a trigger reading arbitrary NEW.metadata from any future writer'). 'Mirroring ... exactly' is therefore false as written. Either drop 'exactly' and state the deliberate divergence, or state that the trigger is intentionally STRICTER than the app helper on absent keys.",

  "MEDIUM (NEW): The two acceptance criteria added by this correction have NO test_scenarios, and the tightening has no test at all. AC-7 (INSERT-path regression) and AC-8 (UPDATE short-circuit) were added to functional_requirements but no matching TS was added to test_scenarios (list unchanged: TS-1, 2, 2b, 2c, 2d, 2e, 2f, 3, 4, 5, 5b, 6, 7). risks[0].mitigation cites 'TS-1/TS-2/TS-2b/TS-2d/TS-2f (INSERT-path) plus THE NEW INSERT-SPECIFIC REGRESSION TEST must all pass' -- that named test does not exist anywhere in the PRD. Separately there is no TS for the 'control_pack_status present but one required key ABSENT' case, which is the entire purpose of the tightening; TS-2d covers only the whole-control_pack_status-key-missing case. Per the 100%-AC-coverage requirement, add a TS for AC-7, a corrected TS for AC-8, and a TS for the absent-required-key case.",

  "LOW (informational, not blocking): PostgreSQL does not guarantee left-to-right short-circuit evaluation of OR/AND (docs 4.2.14 'Expression Evaluation Rules' -- the order of evaluation of subexpressions is not defined). A guard whose SAFETY depended on the OR short-circuiting would be unsound in principle. This does not bite here only because OLD is assigned-but-NULL on INSERT (see BLOCKER-1), so OLD.metadata is safe to evaluate unconditionally; the cited precedent's AND-form carries the identical theoretical exposure. Worth one sentence in the migration header so a future reader does not mistake the OR for a guaranteed guard."
];

const detailed = {
  pass: 4,
  prd_snapshot: {
    id: 'PRD-SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001',
    updated_at: '2026-09-13T02:11:00.726206',
    pulled_fresh: true
  },
  verified_good: [
    "Precedent citation VERIFIED BY DIRECT READ and accurate: database/chairman-gated/20260906_retrospectives_published_guard.sql line 172 is \"IF TG_OP = 'UPDATE' AND OLD.retro_type = 'SD_COMPLETION' AND OLD.status = 'PUBLISHED' THEN\"; lines 228-229 are \"CREATE TRIGGER zzz_retrospectives_published_guard BEFORE INSERT OR UPDATE ON public.retrospectives\". It IS a BEFORE INSERT OR UPDATE trigger that guards every OLD access behind TG_OP first, exactly as the PRD describes. Note it is an AND-form (skip OLD logic on INSERT) where the PRD prescribes an OR-form (run body on INSERT) -- different intent, both safe.",
    "Waiver argument VERIFIED at source: lib/eva/uat-control-pack.js:223 emits the `waived: ${reason}` template; :226-227 compute missing/allRequiredEvaluated by inequality against 'not_attempted'. The PRD's inequality-not-equality mandate is correct and well-founded; an equality-against-'evaluated' implementation would indeed invert a waived control.",
    "Live data RE-MEASURED INDEPENDENTLY this pass (not trusted from prior passes): uat_test_runs has 26 rows; 0 rows disagree with the tightened predicate (no-backfill claim CORRECT); 0 rows exercise the absent-key vacuous case; distinct live control_pack_status values are exactly {'not_attempted' x72, 'evaluated' x24} -- no waiver has ever been written, confirming the PRD's 'zero production precedent today' claim.",
    "Fixture matrix EXECUTED against a real PG 17.4 trigger implementing the PRD's prescribed predicate: AC-2 (3 of 4 not_attempted -> false) PASS; AC-3 (all 4 evaluated -> true) PASS; AC-6 (1 waived + 3 evaluated -> true) PASS; absent-key -> false PASS; empty {} -> false PASS. The prescribed predicate is implementable and behaves as specified.",
    "Pass-3 BLOCKER-3 (technical_decisions[0] vs [3] contradiction) IS FIXED -- [0] now says only uat_test_runs ships and both FR-5 and FR-6 are fully descoped, consistent with [3].",
    "Pass-3 BLOCKER-4 (integration_points listing strategic_directives_v2) IS FIXED -- integration_points is now exactly ['uat_test_runs','CI pipeline (new lint job)'].",
    "Pass-3 Mediums ARE FIXED: TR-4 and TR-5 now frame one shipping trigger target with FR-5/FR-6 explicitly descoped; exploration_summary.patterns_identified[1] is now prefixed 'For a future FR-5 follow-up SD only (not used by anything shipping in this SD)'.",
    "risks[1] and risks[2] (the FR-5 and FR-6 descope risks) are accurate and internally consistent with the descoped design.",
    "NO stale-section drift in the large fields this pass: the `content` markdown is a faithful mirror of the corrected structured fields (headings, FR/TR/TS/risks text all match). A genuine improvement over passes 1-3. metadata.design_analysis.sd_context.scope quotes the ORIGINAL SD scope verbatim (including the superseded control_pack_failures design and the 'current fourteen' figure) -- preserved input context, not PRD drift, acceptable."
  ],
  method: {
    empirical_probe: ".artifacts/tq-plpgsql-probe.mjs -- BEGIN; TEMP TABLE ON COMMIT DROP; SAVEPOINT-guarded; ROLLBACK always. Nothing persisted.",
    live_reverify: ".artifacts/tq-live.mjs -- read-only recomputation of the tightened predicate against all 26 uat_test_runs rows.",
    source_reads: [
      "database/chairman-gated/20260906_retrospectives_published_guard.sql",
      "lib/eva/uat-control-pack.js:196-230",
      "lib/uat/result-recorder.js:110-125"
    ]
  },
  net_assessment: "Every pass-3 finding EXCEPT its own BLOCKER-1 was genuinely fixed, and the stale-section drift that recurred in passes 1-3 is gone. The FAIL is because pass-3's BLOCKER-1 was itself factually wrong on PG 17.4 and has now been baked into the PRD as asserted fact -- including as the sole risk covering the only shipping migration -- plus two new defects introduced by the correction itself (an unsatisfiable AC-8, and a tightening that did not propagate to 2 sections). THE SHIPPING DESIGN IS SOUND: the prescribed trigger predicate and guard both behave correctly when implemented and run against the real database. What fails is the PRD's factual record and its AC/test coverage, not the trigger."
};

const results = {
  verdict: 'FAIL',
  confidence: 94,
  critical_issues,
  warnings: [],
  recommendations: [],
  metadata: { phase: 'PLAN', findings: detailed }
};

const resolution = await resolveSubAgentRepo({ subAgentCode: 'TESTING', sdId: SD })
  .catch((e) => ({ repoPath: process.cwd(), repoResolved: false, registrySource: 'error:' + e.message }));
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: true });

const row = {
  id: randomUUID(),
  sd_id: SD,
  sub_agent_code: 'TESTING',
  sub_agent_name: 'QA Engineering Director',
  verdict: results.verdict,
  confidence: results.confidence,
  critical_issues: results.critical_issues,
  warnings: results.warnings,
  recommendations: results.recommendations,
  metadata: results.metadata,
  execution_time: 0,
  validation_mode: 'prospective',
  source: 'sub_agent_executor',
  phase: 'PLAN',
  invocation_id: randomUUID()
};

const { data, error } = await sb
  .from('sub_agent_execution_results')
  .insert(row)
  .select('id, verdict, confidence, created_at');

if (error) {
  console.error('INSERT ERROR', JSON.stringify(error));
  process.exit(1);
}
console.log('EVIDENCE WRITTEN:', JSON.stringify(data[0], null, 2));
console.log('metadata.repo_path =', results.metadata.repo_path);
console.log('metadata.executed_from_cwd =', results.metadata.executed_from_cwd);
console.log('critical_issues count =', critical_issues.length);
