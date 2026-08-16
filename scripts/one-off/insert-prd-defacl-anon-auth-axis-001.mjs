#!/usr/bin/env node
// PLAN-phase PRD authoring for SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001.
// Inline mode per CLAUDE_PLAN.md: add-prd-to-database.js printed the generation prompt +
// auto-ran DESIGN/DATABASE/SECURITY/RISK sub-agent evidence (all persisted to
// sub_agent_execution_results). This script authors the PRD JSON directly (Claude Code IS
// the model that would have been called externally) incorporating:
//   - VALIDATION (9af23eb7): reuse scripts/audit-rpc-execute-grants.mjs's bucket manifest +
//     completeness gate; _DOWN.sql naming convention; no duplicate SD/QF on this axis.
//   - Explore (77400242): predecessor migration file locations, KEEP-list source
//     (scripts/audit-rpc-execute-grants-buckets.json Bucket C), lint/guard interactions.
//   - Mechanism verification (scripts/one-off/verify-defacl-anon-auth-axis-mechanism-001.mjs):
//     live-confirmed by-name anon/authenticated grants, zero literal-PUBLIC, census 145/28/41/18.
//   - Prospective TESTING (d2d233ca): the CRITICAL two-axis correction -- ALTER DEFAULT
//     PRIVILEGES is future-scoped only; existing-function triage is a SEPARATE mechanism
//     (explicit REVOKE) from the defacl fix. Acceptance must assert both independently and
//     must NOT let the defacl fix's proof cover the existing-surface triage's result.
//   - SECURITY sub-agent (auto-run by add-prd-to-database.js): found 60 BYPASSRLS-owner SECDEF
//     functions anon/authenticated-executable across public+governance+portfolio schemas --
//     this SD's approved scope is schema=public only (28+41 of those 60); the governance/
//     portfolio-schema functions are flagged as an explicit, documented out-of-scope gap
//     (FR-6 + a dedicated risk), not silently dropped.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001';
const SD_UUID = '6b32a991-f177-467b-b1a3-8f053519f6e1';
const PRD_ID = `PRD-${SD_KEY}`;

const executive_summary =
  'Per-role default-ACL REVOKE (postgres, supabase_admin) closes the future-function anon/authenticated EXECUTE leak; ' +
  'a separate, evidence-triaged explicit REVOKE closes the same leak on the 145 existing public SECDEF functions.';
// 259 chars, within 100-300.

const functional_requirements = [
  {
    id: 'FR-1',
    requirement: 'Stage a per-role ALTER DEFAULT PRIVILEGES REVOKE for anon/authenticated/PUBLIC, targeting EXACTLY the two creator roles that mint functions in schema public.',
    description:
      'Author database/chairman-gated/<date>_defacl_anon_auth_axis.sql containing, for EACH of ROLE postgres and ROLE supabase_admin: ' +
      'ALTER DEFAULT PRIVILEGES FOR ROLE <role> IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, PUBLIC; ' +
      'Per-role form only -- a bare "IN SCHEMA public REVOKE ..." with no FOR ROLE clause is the additive-only trap (ADP-IN-SCHEMA=ADD-ONLY) and does not subtract an existing role-scoped default. ' +
      'This statement is FUTURE-SCOPED ONLY: it changes what a CREATE FUNCTION issued by postgres/supabase_admin after apply inherits. It has zero effect on the 145 functions that already exist (AXIS-1, distinct from FR-2\'s AXIS-2).',
    priority: 'CRITICAL',
    acceptance_criteria: [
      'AC-1: File contains 2 ALTER DEFAULT PRIVILEGES statements, one per FOR ROLE clause (postgres, supabase_admin), each naming anon, authenticated, PUBLIC explicitly in the REVOKE list.',
      'AC-2: A --approved-by header is present but left blank pending chairman ceremony, matching scripts/lib/migration-guards.js APPROVED_BY_RE convention.',
      'AC-3: The file is placed under database/chairman-gated/ (never database/migrations/) and is never executed by any inline apply path -- grep of scripts/ finds no auto-apply reference to this filename.',
    ],
  },
  {
    id: 'FR-2',
    requirement: 'Extend scripts/audit-rpc-execute-grants-buckets.json (and its completeness gate) to cover the full 145-function public SECDEF surface, triaged KEEP vs REVOKE, and stage the REVOKE set as an executable migration -- AXIS-2, explicit per-function grants on EXISTING functions.',
    description:
      'Reuse scripts/audit-rpc-execute-grants.mjs\'s AUDIT_GRANTS_MODE=buckets machinery (Explore finding) rather than a new parallel script. For each of the 28 live anon-EXEC and 41 live authenticated-EXEC functions in public (union, since some overlap), classify KEEP (an anon/authenticated caller exists -- e.g. fn_submit_venture_user_feedback, fn_anon_ingress_prior_hour_count, fn_submit_venture_feedback, fn_submit_venture_error, plus the Bucket C RLS-policy-referenced set already documented: fn_is_chairman, fn_user_has_venture_access, fn_is_service_role, is_leo_admin, check_feedback_rate_limit, venture_exists_and_active, is_chairman_role, fn_relay_insert_sms_candidate) or REVOKE (no caller found). ' +
      'Stage database/chairman-gated/<date>_defacl_anon_auth_axis_triage.sql with per-function REVOKE EXECUTE ... FROM anon/authenticated statements for the REVOKE set, plus REVOKE ... FROM PUBLIC for the 18 literal-PUBLIC aclitem functions. ' +
      'MUST add fn_submit_venture_user_feedback, fn_submit_venture_feedback, fn_submit_venture_error to the completeness-gate manifest as Bucket C entries -- VALIDATION found them currently UNDECLARED, meaning today\'s completeness gate cannot see the binding KEEP constraint at all.',
    priority: 'CRITICAL',
    acceptance_criteria: [
      'AC-1: scripts/audit-rpc-execute-grants-buckets.json grows from 16 to a number of entries matching the exact union of the 28/41/18 live census (re-measured at authoring time, not the 2026-08-16 snapshot, since state may have shifted).',
      'AC-2: fn_submit_venture_user_feedback + 2 named siblings are present in the manifest with bucket=C (KEEP) and a documented caller/reason.',
      'AC-3: findUndeclaredExposures() run against the live catalog returns an empty array once the triage migration (staged, not applied) is accounted for in the manifest.',
    ],
  },
  {
    id: 'FR-3',
    requirement: 'Author paired _DOWN.sql files for both FR-1 and FR-2, each re-granting exactly what its UP file revoked -- no more, no less.',
    description:
      'House convention (Explore finding: 9 of 10 recent chairman-gated pairs) is <stem>_DOWN.sql, an executable file (BEGIN; SET LOCAL lock_timeout; reversal statements; NOTIFY pgrst, \'reload schema\'; COMMIT;), not an inline comment block -- matching database/chairman-gated/20260815_venture_user_feedback_ownership_rpc_DOWN.sql\'s template. ' +
      'FR-1\'s DOWN re-issues ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, PUBLIC per role (restoring the default, not a REVOKE of a REVOKE). FR-2\'s DOWN re-GRANTs EXECUTE on exactly the REVOKE-set function signatures captured from a pre-apply baseline snapshot (not a blanket GRANT loop -- the exact bug already found in database/migrations/20260603_03_..._rollback.sql:19 must not be repeated).',
    priority: 'HIGH',
    acceptance_criteria: [
      'AC-1: Each DOWN file is named <UP-stem>_DOWN.sql and lives beside its UP file.',
      'AC-2: FR-2\'s DOWN file enumerates function signatures explicitly (no ANY(SELECT ...) blanket loop over all SECDEF functions).',
      'AC-3: A hash of {defaclacl per role+schema, aclexplode(proacl) per REVOKE-set function} taken before UP and after DOWN are byte-identical; taken before UP and after UP (no DOWN) differ.',
    ],
  },
  {
    id: 'FR-4',
    requirement: 'Build a two-axis catalog acceptance script (--baseline / --verify) that independently proves FR-1 (future-scoped defacl) and FR-2 (existing-surface triage), and explicitly asserts the separate, out-of-scope public_exec=true defect is UNCHANGED, not fixed.',
    description:
      '--baseline (read-only, runnable today via the working exec_sql RPC path -- pooler direct-connect is credential-broken, confirmed in scripts/one-off/verify-defacl-anon-auth-axis-mechanism-001.mjs) captures JSON: {defacl_rows_by_creator_role, secdef_total, anon_exec, authenticated_exec, literal_public, public_exec_count, keep_list_privileges}. Two-sided assertion: baseline must SHOW anon/authenticated named by-role and zero literal-PUBLIC (a clean baseline voids the run). ' +
      '--verify AXIS-1: create a throwaway probe function as postgres (or supabase_admin) after apply, assert it inherits NO anon/authenticated EXECUTE via has_function_privilege, then drop it -- this is the only proof that actually exercises the default-ACL mechanism (a count-only assertion over existing functions proves nothing about FR-1). AXIS-2: per-signature has_function_privilege sweep over the REVOKE-set matches expected false; KEEP-set matches expected true. ' +
      'The out-of-scope guard: assert public_exec_count from --verify EQUALS the --baseline value (unchanged), tagged scope: NARROW_DEFACL_ONLY -- the acceptance script must FAIL if this count changes, since a change signals someone silently widened the claim to cover the separate 636/759 public_exec defect (database/migrations/20260603_03_..._rollback.sql:19), which is out of scope here and owned by secdef-execute-revoke-lint.mjs + the buckets completeness gate.',
    priority: 'CRITICAL',
    acceptance_criteria: [
      'AC-1: Running --baseline then --verify with no apply in between reports AXIS-1 FAIL (probe still inherits EXECUTE) and public_exec_count unchanged.',
      'AC-2: Against a synthetic fixture representing post-apply state (since EXEC cannot run chairman-gated DDL against production), --verify reports AXIS-1 PASS, AXIS-2 PASS for REVOKE-set, AXIS-2 PASS for KEEP-set (still executable), and out-of-scope guard PASS.',
      'AC-3: A committed synthetic --self-test mode exercises the same assertion logic over fixture data with no live DB connection, proving the acceptance LOGIC independent of live catalog OBSERVABILITY (per prospective TESTING guidance: fixture proves logic, live baseline proves observability -- ship both).',
    ],
  },
  {
    id: 'FR-5',
    requirement: 'Extract the census/manifest-compliance logic already in scripts/audit-rpc-execute-grants.mjs into pure, unit-testable functions covering the extended 145-function surface, so weekly drift checks do not require a live DB connection for their logic tier.',
    description:
      'evaluateBucketCompliance() and findUndeclaredExposures() (existing, per Explore/VALIDATION) already are pure functions operating on a manifest + a live-fetched grant snapshot. Add unit tests: (a) manifest-shape validation against the extended 145-entry set, (b) a synthetic 145-row grant map fed through both functions at both polarities (all-compliant, and each of several single-row violations), (c) a mutation test that injects one undeclared anon-EXEC signature into the synthetic snapshot and asserts findUndeclaredExposures() reports it (proves the gate is not vacuously green), (d) a scale check that the live query\'s ANY(ARRAY[...]) single-line SQL construction (workaround for the exec_sql wrapper\'s multi-line-SQL false-rejection, confirmed in this SD\'s mechanism verification) stays correct at 145 array elements.',
    priority: 'HIGH',
    acceptance_criteria: [
      'AC-1: A mutation test exists that fails RED when an undeclared exposure is injected and the completeness-gate logic is bypassed, and passes GREEN against the real logic.',
      'AC-2: Unit tests run with zero network/DB calls (pure function inputs are synthetic fixtures).',
      'AC-3: The manifest-shape test fails if any of the 3 binding-KEEP function names (fn_submit_venture_user_feedback + 2 siblings) is absent from the manifest.',
    ],
  },
  {
    id: 'FR-6',
    requirement: 'Document, as an explicit out-of-scope finding (not a silent omission), that 60 BYPASSRLS-owner SECURITY DEFINER functions across public+governance+portfolio schemas are anon/authenticated-executable, of which this SD\'s approved scope (schema=public only) covers 28+41; the governance/portfolio-schema subset is a candidate for a follow-up SD.',
    description:
      'The auto-run SECURITY sub-agent (LEAD-phase, this PRD\'s authoring) found 60 total BYPASSRLS-owner SECDEF functions anon/authenticated-executable, spanning public, governance, and portfolio schemas -- named examples include governance.rls_governance_read_policy(), portfolio.kill_switch(...), portfolio.reactivate_venture(...). This SD\'s coordinator-approved scope (per coordinator_review_reason) is schema=public only, matching the Hotel census this SD\'s premise is built on. Expanding to governance/portfolio would require a fresh coordinator fence-review (scope is locked at LEAD approval) -- record the gap instead of silently absorbing or silently dropping it.',
    priority: 'MEDIUM',
    acceptance_criteria: [
      'AC-1: PRD risks section names the governance/portfolio-schema functions explicitly with a recommendation to file a follow-up SD.',
      'AC-2: The staged migration files (FR-1, FR-2) touch schema=public only -- grep confirms zero governance.*/portfolio.* statements.',
      'AC-3: SD completion-flags capture routes this finding as a "tied_to_sd" or "needs_decision" flag at LEAD-FINAL-APPROVAL, not silently closed.',
    ],
  },
];

const technical_requirements = [
  {
    id: 'TR-1',
    requirement: 'ALTER DEFAULT PRIVILEGES statements MUST use the per-role FOR ROLE <role> form, never a bare per-schema form with no FOR ROLE clause.',
    rationale: 'A bare "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ..." only affects defaults for the CURRENT connecting role (typically the migration runner), not for postgres/supabase_admin specifically, and per-schema-only ADP is additive-only (cannot subtract an existing role-scoped grant) -- the documented ADP-IN-SCHEMA=ADD-ONLY trap that caused CLOSE-REMAINING-SECURITY-001\'s FR-4 to be descoped after 3 failed attempts.',
  },
  {
    id: 'TR-2',
    requirement: 'All live-catalog verification during PLAN/EXEC must use supabase.rpc(\'exec_sql\', { sql_text }) with single-line SQL text (no leading newline/indentation), NOT a direct pg.Client pooler connection.',
    rationale: 'The direct pooler connection (SUPABASE_POOLER_URL, SUPABASE_DB_PASSWORD) fails with "password authentication failed for user postgres" -- confirmed independently in this SD\'s LEAD phase and matching an identical finding recorded in scripts/one-off/lead-correct-scan-findings-close-remaining-security-001.mjs:98-102 from a prior SD. The exec_sql RPC path works but its wrapper falsely rejects multi-line/indented SQL text with a 42501 "only allows SELECT/WITH" error -- every catalog query must be single-line.',
  },
  {
    id: 'TR-3',
    requirement: 'The acceptance script\'s AXIS-1 (defacl) proof must use a create-then-drop probe function, never a count over pre-existing functions.',
    rationale: 'ALTER DEFAULT PRIVILEGES only governs objects created AFTER the statement runs. Counting anon/authenticated-EXEC over the 145 pre-existing functions measures FR-2\'s (explicit REVOKE) result, not FR-1\'s (default-ACL) result -- conflating the two axes was the single highest-value correction from the prospective TESTING sub-agent review.',
  },
  {
    id: 'TR-4',
    requirement: 'DOWN-file re-grants must enumerate exact function signatures captured from a pre-apply baseline, never a blanket GRANT ... TO anon, authenticated, PUBLIC loop over all SECDEF functions.',
    rationale: 'database/migrations/20260603_03_revoke_secdef_execute_from_anon_authenticated_rollback.sql:19 already contains exactly this blanket-loop bug and is the documented root cause of the separate, out-of-scope 636/759 public_exec=true defect -- repeating the pattern in this SD\'s own DOWN file would reintroduce the same defect class this SD exists to close on the anon/authenticated axis.',
  },
];

const system_architecture = {
  overview:
    'Two independent, additively-staged migration pairs (never applied inline) plus an extended manifest-driven completeness gate and a two-axis catalog acceptance script. FR-1 closes the FUTURE-function leak (default ACL, per-role). FR-2 closes the EXISTING-function leak (explicit per-function REVOKE, triaged KEEP/REVOKE) by extending the already-live scripts/audit-rpc-execute-grants.mjs manifest rather than building parallel infrastructure. Both are proven by one acceptance script with two independently-failing axes, plus a scope guard proving the separate 636/759 public_exec defect is left untouched.',
  components: [
    {
      name: 'database/chairman-gated/<date>_defacl_anon_auth_axis.sql (+ _DOWN.sql)',
      responsibility: 'Per-role ALTER DEFAULT PRIVILEGES REVOKE for postgres and supabase_admin, schema public, functions, FROM anon/authenticated/PUBLIC. Staged only; requires chairman ceremony apply.',
      technology: 'PostgreSQL DDL',
    },
    {
      name: 'database/chairman-gated/<date>_defacl_anon_auth_axis_triage.sql (+ _DOWN.sql)',
      responsibility: 'Per-function explicit REVOKE for the triaged REVOKE-set (of the 28 anon-EXEC / 41 authenticated-EXEC / 18 literal-PUBLIC live functions), data-driven from the extended manifest.',
      technology: 'PostgreSQL DDL',
    },
    {
      name: 'scripts/audit-rpc-execute-grants-buckets.json (extended)',
      responsibility: 'KEEP/REVOKE manifest for the full 145-function public SECDEF surface (grown from the predecessor SD\'s 16-function manifest); source of truth for both the triage migration and the completeness gate.',
      technology: 'JSON, hand-curated + census-cross-checked',
    },
    {
      name: 'scripts/audit-rpc-execute-grants.mjs (extended)',
      responsibility: 'evaluateBucketCompliance() / findUndeclaredExposures() pure functions, reused and extended (not duplicated) to cover the full surface; runnable manually or in CI as the weekly drift check.',
      technology: 'Node.js, Supabase JS client',
    },
    {
      name: 'database/chairman-gated/<date>_defacl_anon_auth_axis_acceptance.mjs',
      responsibility: 'Two-axis acceptance: --baseline (pre-apply catalog snapshot), --verify (post-apply proof: AXIS-1 probe-function test, AXIS-2 per-signature sweep, out-of-scope public_exec_count guard), --self-test (fixture-only, no DB, proves assertion logic).',
      technology: 'Node.js, supabase.rpc(exec_sql) over REST',
    },
  ],
  data_flow:
    'Live catalog (pg_default_acl, pg_proc.proacl) -> exec_sql RPC (single-line SQL, service-role) -> acceptance script JSON snapshots (--baseline, --verify) -> compared against the extended buckets.json manifest by evaluateBucketCompliance()/findUndeclaredExposures() -> PASS/FAIL verdict with per-axis breakdown, never a single collapsed verdict.',
  integration_points: [
    'scripts/audit-rpc-execute-grants.mjs (existing recurrence guard, extended not duplicated)',
    'scripts/lint/secdef-execute-revoke-lint.mjs (existing CI-blocking preventive control, unaffected by this SD)',
    'database/chairman-gated/README.md ceremony process (apply-time gate, out of this SD\'s scope)',
  ],
};

const test_scenarios = [
  {
    id: 'TS-1',
    scenario: 'Baseline capture proves the live premise before any apply: pg_default_acl grants anon/authenticated by name for both creator roles in schema public, zero literal-PUBLIC entries.',
    test_type: 'integration',
    given: 'Live EHG_Engineer catalog, no migration applied',
    when: 'acceptance.mjs --baseline runs',
    then: 'Output JSON shows defacl_rows_by_creator_role naming anon+authenticated for postgres and supabase_admin with no PUBLIC grantee; secdef_total/anon_exec/authenticated_exec/literal_public match the live census (145/28/41/18 at authoring time, re-measured not hardcoded).',
  },
  {
    id: 'TS-2',
    scenario: 'AXIS-1 probe-function test on a synthetic post-apply fixture proves the default-ACL mechanism specifically (not a existing-function count).',
    test_type: 'integration',
    given: 'A synthetic fixture representing state after FR-1\'s DDL has applied (EXEC cannot run chairman-gated DDL against production)',
    when: 'acceptance.mjs --verify runs against the fixture; a probe function is created-then-dropped',
    then: 'has_function_privilege(anon/authenticated, probe_oid, EXECUTE) = false for both; AXIS-1 verdict = PASS.',
  },
  {
    id: 'TS-3',
    scenario: 'Out-of-scope guard fails loud if the separate public_exec defect count changes between baseline and verify, preventing scope creep in the acceptance claim.',
    test_type: 'integration',
    given: 'baseline public_exec_count = N (the pre-existing 636/759-class defect, untouched by this SD)',
    when: 'verify runs after FR-1+FR-2 apply (fixture or live)',
    then: 'verify public_exec_count still = N; guard PASS. If a future edit widens the acceptance script to also revoke PUBLIC-axis grants without updating this guard, the guard FAILs (N changes), catching the scope-creep before merge.',
  },
  {
    id: 'TS-4',
    scenario: 'DOWN-file exact-restoration proof via before/after hashing.',
    test_type: 'integration',
    given: 'Pre-UP hash of {defaclacl per role+schema, aclexplode(proacl) per REVOKE-set function}',
    when: 'UP applies (fixture), then DOWN applies immediately after',
    then: 'Post-DOWN hash equals pre-UP hash exactly; post-UP (no DOWN) hash differs from pre-UP hash -- proves DOWN is a real inverse, not a no-op that trivially matches.',
  },
  {
    id: 'TS-5',
    scenario: 'Completeness-gate mutation test: an undeclared anon-EXEC function must be caught, not silently pass.',
    test_type: 'unit',
    given: 'A synthetic 145-row grant snapshot matching the extended manifest exactly (all declared)',
    when: 'One row is mutated to add an undeclared anon-EXEC signature not present in buckets.json',
    then: 'findUndeclaredExposures() returns exactly that one signature; the completeness gate reports FAIL. Reverting the mutation returns PASS -- proves the gate is not vacuously green.',
  },
  {
    id: 'TS-6',
    scenario: 'Binding KEEP regression: fn_submit_venture_user_feedback (and siblings) retain anon EXECUTE after both migrations apply.',
    test_type: 'security',
    given: 'fn_submit_venture_user_feedback classified Bucket C (KEEP) in the extended manifest, anon_exec=true today',
    when: 'FR-2\'s triage migration applies (fixture) -- this function must NOT be in the REVOKE set',
    then: 'has_function_privilege(anon, fn_submit_venture_user_feedback_oid, EXECUTE) = true, both from the acceptance script and from evaluateBucketCompliance() -- a dedicated positive-privilege assertion distinct from the bulk completeness gate, since findUndeclaredExposures() no-ops on already-compliant Bucket C entries and could not by itself catch an accidental removal.',
  },
  {
    id: 'TS-7',
    scenario: 'Self-test mode proves acceptance-script assertion LOGIC with zero live DB dependency.',
    test_type: 'unit',
    given: 'Committed synthetic pre-apply and post-apply fixture snapshots, no network access',
    when: 'acceptance.mjs --self-test runs',
    then: 'All AXIS-1/AXIS-2/out-of-scope-guard assertions evaluate correctly against the fixtures, independent of whether the live pooler credential or exec_sql RPC path is currently working -- decouples logic correctness from live observability.',
  },
  {
    id: 'TS-8',
    scenario: 'Scope boundary: staged migration files touch schema=public exclusively; governance/portfolio-schema anon-EXEC functions are untouched and separately documented.',
    test_type: 'security',
    given: 'FR-1 and FR-2 staged SQL files',
    when: 'grep for governance.* / portfolio.* function references in both files',
    then: 'Zero matches -- confirms the approved scope boundary was not silently widened during implementation.',
  },
];

const risks = [
  {
    risk: 'Implementation may not fully address root cause',
    probability: 'LOW',
    impact: 'LOW',
    mitigation: 'Verify against original evidence; re-queue via /learn if pattern recurs.',
    rollback_plan: 'Chairman-gated DOWN files restore prior state exactly; no live-apply rollback needed since nothing applies inline.',
  },
  {
    risk:
      'The predecessor migration (database/chairman-gated/20260816_close_remaining_secdef_execute_exposure.sql:16-28) documents a SEPARATE, already-tracked defect (84% of public functions, 636/759, public_exec=true via a blanket GRANT...TO PUBLIC bug at database/migrations/20260603_03_revoke_secdef_execute_from_anon_authenticated_rollback.sql:19) that this SD must not silently claim to fix.',
    probability: 'MEDIUM',
    impact: 'MEDIUM',
    mitigation: 'Acceptance script (FR-4) asserts the narrow claim only and includes an explicit out-of-scope guard (TS-3) that fails if the public_exec_count changes between baseline and verify.',
    rollback_plan: 'If the guard ever fires, treat it as a scope-creep signal and revert the acceptance-script change that introduced it, not the staged migrations themselves.',
  },
  {
    risk: 'AXIS-1 (future-scoped default-ACL) and AXIS-2 (existing-function explicit REVOKE) are two genuinely different mechanisms that a first-draft acceptance script is likely to conflate, producing a false PASS that only ever exercised AXIS-2.',
    probability: 'HIGH',
    impact: 'HIGH',
    mitigation: 'FR-4/TR-3 mandate a create-then-drop probe function as the ONLY accepted AXIS-1 proof; a count over pre-existing functions is explicitly disallowed as AXIS-1 evidence in the PRD.',
    rollback_plan: 'If EXEC ships an acceptance script that conflates the axes, PLAN-TO-LEAD verification (TESTING sub-agent) must reject it and require the probe-function test before re-submission.',
  },
  {
    risk: '60 BYPASSRLS-owner SECURITY DEFINER functions across public+governance+portfolio schemas are anon/authenticated-executable (found live by the auto-run SECURITY sub-agent during PRD authoring); this SD\'s approved scope covers only the 28+41 public-schema subset.',
    probability: 'MEDIUM',
    impact: 'MEDIUM',
    mitigation: 'FR-6 documents the gap explicitly and routes it as a completion-flags finding at LEAD-FINAL-APPROVAL, recommending a follow-up SD for governance/portfolio-schema triage rather than silently expanding this SD\'s locked scope.',
    rollback_plan: 'Not applicable -- no code change is made to governance/portfolio schemas by this SD; the risk is documentation-only until a follow-up SD is approved.',
  },
  {
    risk: 'Direct pooler DB connection (SUPABASE_POOLER_URL) is credential-broken ("password authentication failed for user postgres"), confirmed independently in this SD and in a prior SD -- any EXEC-phase tooling that assumes pg.Client connectivity will fail.',
    probability: 'LOW',
    impact: 'MEDIUM',
    mitigation: 'TR-2 mandates the exec_sql RPC path (service-role REST) for all live catalog verification; EXEC must use this path, confirmed working in this SD\'s own mechanism-verification script.',
    rollback_plan: 'If the pooler credential is fixed before EXEC, both paths remain valid -- no rollback needed, just an optional simplification.',
  },
];

const implementation_approach = {
  phases: [
    {
      phase: 'Phase 1: Triage authoring',
      description: 'Re-measure the live 28/41/18 census (exec_sql RPC, single-line SQL per TR-2), extend scripts/audit-rpc-execute-grants-buckets.json to the full surface with KEEP/REVOKE classification per function (caller census), and add the 3 binding-KEEP entries currently undeclared.',
      deliverables: ['Extended scripts/audit-rpc-execute-grants-buckets.json', 'Per-function caller-census evidence recorded in SD/PRD metadata'],
    },
    {
      phase: 'Phase 2: Staged migration authoring',
      description: 'Author the two UP files (FR-1 defacl, FR-2 triage) and their two _DOWN.sql pairs, following house convention and TR-1/TR-4 constraints.',
      deliverables: ['database/chairman-gated/<date>_defacl_anon_auth_axis.sql + _DOWN.sql', 'database/chairman-gated/<date>_defacl_anon_auth_axis_triage.sql + _DOWN.sql'],
    },
    {
      phase: 'Phase 3: Acceptance + unit test authoring',
      description: 'Build the two-axis acceptance script (--baseline/--verify/--self-test) and the unit-tier manifest/completeness-gate tests (mutation test included).',
      deliverables: ['database/chairman-gated/<date>_defacl_anon_auth_axis_acceptance.mjs', 'Unit tests for evaluateBucketCompliance()/findUndeclaredExposures() at the extended surface'],
    },
    {
      phase: 'Phase 4: Verification without live apply',
      description: 'Run --baseline against production (read-only, safe), run --verify/--self-test against synthetic fixtures (since chairman-gated DDL cannot be applied by EXEC), and document the ceremony-time apply procedure for the chairman.',
      deliverables: ['Baseline evidence artifact', 'Fixture-based --verify + --self-test pass evidence', 'Ceremony runbook note in the migration header'],
    },
  ],
  technical_decisions: [
    'Extend scripts/audit-rpc-execute-grants.mjs\'s existing manifest/completeness-gate machinery rather than building a parallel script (VALIDATION finding) -- avoids a second, divergent representation of the same KEEP/REVOKE decision.',
    'Split acceptance into two independently-failing axes (AXIS-1 default-ACL, AXIS-2 explicit-grant) rather than one collapsed verdict, per prospective TESTING guidance -- prevents a false PASS that only ever proved one mechanism.',
    'Use exec_sql RPC (service-role REST) instead of direct pooler pg.Client for all live verification, since the pooler credential is confirmed broken.',
  ],
};

const acceptance_criteria = [
  'Two staged (never inline-applied) UP/DOWN migration pairs exist under database/chairman-gated/, one for the per-role defacl fix (FR-1) and one for the existing-surface triage (FR-2), each following the _DOWN.sql naming convention.',
  'scripts/audit-rpc-execute-grants-buckets.json is extended to cover the full live 145-function public SECDEF surface with KEEP/REVOKE classification, including the 3 previously-undeclared binding-KEEP functions.',
  'A two-axis acceptance script (--baseline/--verify/--self-test) exists and its --self-test mode passes with zero live DB dependency, proving AXIS-1 (probe-function), AXIS-2 (per-signature sweep), and the out-of-scope public_exec_count guard all independently.',
  'Unit tests for the extended completeness-gate logic include a mutation test proving the gate is not vacuously green.',
  'PRD risks explicitly document the governance/portfolio-schema out-of-scope finding (60 total vs 28+41 in-scope) as a completion-flags routed item, not a silent omission.',
];

const integration_operationalization = {
  consumers: [
    { name: 'Chairman (ceremony operator)', interaction: 'Reviews and approves the staged UP files at ceremony N+1 by filling the @approved-by header with a bare email matching git user.email, then applies manually.', frequency: 'One-time, at the named ceremony anchor.' },
    { name: 'scripts/audit-rpc-execute-grants.mjs (CI/manual weekly drift check)', interaction: 'Reads the extended buckets.json manifest and re-queries the live catalog to detect new undeclared anon/PUBLIC-EXEC functions.', frequency: 'Weekly (manual npm script today; wiring to CI/cron is a named gap in the predecessor SD, not this one).' },
    { name: 'Existing anon-facing RPC callers (e.g. the ehg/altifyai feedback-widget consumers of fn_submit_venture_user_feedback)', interaction: 'Continue calling their RPCs with no change in behavior -- the KEEP list preserves their EXECUTE grant through the triage.', frequency: 'Continuous, existing production traffic.' },
  ],
  dependencies: [
    { name: 'scripts/audit-rpc-execute-grants.mjs + buckets.json (predecessor SD deliverable)', type: 'upstream', contract: 'This SD extends the existing manifest and pure-function API (evaluateBucketCompliance, findUndeclaredExposures) rather than replacing it.', failure_handling: 'If the upstream script\'s API changes shape, this SD\'s extension and tests must be updated in lockstep -- flagged as a shared-scope writer/consumer pair.' },
    { name: 'scripts/lint/secdef-execute-revoke-lint.mjs (CI-blocking preventive control)', type: 'downstream', contract: 'Unaffected by this SD; continues enforcing same-file REVOKE on newly authored SECDEF functions.', failure_handling: 'N/A -- no coupling; documented for completeness since both cover the same defect class from different angles.' },
    { name: 'database/chairman-gated/ ceremony apply process', type: 'downstream', contract: 'This SD\'s deliverables are inert until manually applied at ceremony N+1; EXEC cannot and must not apply them.', failure_handling: 'If ceremony is delayed indefinitely, the recurrence-prevention value (FR-1) is deferred but the existing 28/41/18 exposure remains until then -- no automatic mitigation.' },
  ],
  data_contracts: [
    { contract_name: 'scripts/audit-rpc-execute-grants-buckets.json manifest shape', schema: 'Array of {schema, function, args, bucket: A|B|C, reason, callers[]} entries (existing shape, extended in row-count only).', validation: 'Unit tests assert shape + presence of the 3 binding-KEEP entries.', versioning: 'In-place extension; no schema version bump needed since the shape is unchanged.' },
  ],
  runtime_config: {
    environment_variables: ['SUPABASE_SERVICE_ROLE_KEY (exec_sql RPC path)', 'NEXT_PUBLIC_SUPABASE_URL'],
    feature_flags: [],
    deployment_considerations: 'No deployment -- this SD only stages SQL/JS artifacts; nothing is applied inline or deployed as a service.',
  },
  observability_rollout: {
    monitoring: ['scripts/audit-rpc-execute-grants.mjs weekly run output (manual today)', 'Acceptance script --baseline output diffed against prior baselines'],
    alerts: ['Completeness gate FAIL (undeclared exposure found)', 'Out-of-scope guard FAIL (public_exec_count changed unexpectedly)'],
    rollout_strategy: 'Staged, chairman-gated, single ceremony apply -- not a phased rollout.',
    rollback_trigger: 'Any KEEP-function regression detected post-apply (TS-6 fails in production), or an unexpected application error traced to a revoked function.',
    rollback_procedure: 'Apply the paired _DOWN.sql file for the affected migration (FR-1 or FR-2 independently), verified via the acceptance script\'s baseline-hash comparison (TS-4).',
  },
};

const exploration_summary = {
  files_read: [
    'database/chairman-gated/20260816_close_remaining_secdef_execute_exposure.sql',
    'scripts/one-off/lead-correct-scan-findings-close-remaining-security-001.mjs',
    'scripts/one-off/descope-fr4-close-remaining-security-001.mjs',
    'scripts/audit-rpc-execute-grants.mjs',
    'scripts/audit-rpc-execute-grants-buckets.json',
    'scripts/lint/secdef-execute-revoke-lint.mjs',
    'database/migrations/20260603_03_revoke_secdef_execute_from_anon_authenticated_rollback.sql',
    'database/chairman-gated/20260815_venture_user_feedback_ownership_rpc_DOWN.sql',
    'scripts/one-off/verify-defacl-anon-auth-axis-mechanism-001.mjs (authored + run this SD, live-verified)',
  ],
  patterns_identified: [
    '_DOWN.sql is the current chairman-gated house convention (9/10 recent pairs), not _rollback.sql',
    'Per-role FOR ROLE ADP is required; bare per-schema ADP is additive-only and cannot subtract',
    'ALTER DEFAULT PRIVILEGES is future-scoped only -- existing objects need a separate explicit-grant triage',
    'scripts/audit-rpc-execute-grants.mjs already implements the exact pure-function census/compliance pattern this SD needs, extend not duplicate',
  ],
  key_decisions: [
    'Split the acceptance proof into two independently-failing axes (default-ACL vs explicit-grant) rather than one collapsed verdict',
    'Scope this SD to schema=public only, matching the coordinator-approved fence-review; document (not silently absorb) the governance/portfolio-schema gap',
    'Use exec_sql RPC over REST for all live verification since the direct pooler connection is confirmed credential-broken',
  ],
  exploration_date: '2026-08-16',
};

const prd = {
  id: PRD_ID,
  directive_id: SD_KEY,
  sd_id: SD_UUID,
  title: 'Per-Role Default-ACL REVOKE for anon/authenticated + Triaged SECDEF EXECUTE Sweep',
  version: '1.0',
  status: 'approved',
  category: 'security',
  priority: 'high',
  executive_summary,
  goal_summary: executive_summary,
  functional_requirements,
  technical_requirements,
  system_architecture,
  test_scenarios,
  acceptance_criteria,
  risks,
  implementation_approach,
  integration_operationalization,
  exploration_summary,
  document_type: 'prd',
  phase: 'PLAN',
  created_by: 'Bravo (worker session 698520e6-7b16-46b5-a207-42548fe6a180)',
};

const { data: existing } = await supabase.from('product_requirements_v2').select('id').eq('id', PRD_ID).maybeSingle();

let result;
if (existing) {
  result = await supabase.from('product_requirements_v2').update(prd).eq('id', PRD_ID).select('id,status').maybeSingle();
} else {
  result = await supabase.from('product_requirements_v2').insert(prd).select('id,status').maybeSingle();
}
if (result.error) { console.error('PRD UPSERT ERR:', result.error.message); process.exit(1); }
console.log('PRD upserted:', JSON.stringify(result.data));
