// PRD for SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001, authored per CLAUDE_PLAN.md's inline-mode
// instructions (generate JSON directly, insert into product_requirements_v2). Built from the
// SD's own detailed description (5-dimension scan) PLUS three independent PLAN-phase sub-agent
// reports (DESIGN evidence 3d601cd4/4005535a, DATABASE evidence 08e7cb19/dd3a9175, STORIES
// evidence b09d73b4) that live-verified and CORRECTED the original triage: true residual is 16
// functions (not 42), with two genuine verdict changes (fn_write_kill_audit_trail A->B due to a
// SECURITY INVOKER caller; is_chairman_role B->C due to a roles={public} policy reference).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID = 'ef96ac1a-69f1-4f57-8ba5-fcec84ad66d5';
const SD_KEY = 'SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001';
const PRD_ID = `PRD-${SD_KEY}`;

const BUCKET_A = [
  'fn_enforce_stage_advancement_artifact_gate()',
  'fn_quick_fixes_validate_target_application()',
  'fn_stage_artifact_precondition(uuid,integer)',
  'fn_user_has_company_access(uuid)',
  'fn_verify_and_consume_stepup_token(uuid,uuid)',
  'log_sd_mutation_audit()',
];
const BUCKET_B = [
  'approve_chairman_decision(uuid,text,text,approval_type_enum,uuid)',
  'check_feedback_duplicate(uuid,text)',
  'claim_sd(text,text,text,boolean,integer)',
  'fn_is_service_role()',
  'fn_list_chairman_webauthn_credentials()',
  'fn_user_has_venture_access(uuid)',
  'fn_write_kill_audit_trail(uuid,integer,text,uuid,text,uuid)',
  'get_gate_decision_status(uuid,integer)',
  'reject_chairman_decision(uuid,text,text,uuid)',
  'upsert_operator_cash_burn(numeric,numeric,numeric,numeric)',
];

const executive_summary = 'Closes anon/PUBLIC EXECUTE exposure on 16 SECURITY DEFINER functions (live-verified residual, corrected from an original 42-function scan), extends the regression verifier to see the anon axis it currently misses, and adds a CI standing check so new functions cannot reintroduce the exposure.';

const functional_requirements = [
  {
    id: 'FR-1', priority: 'CRITICAL',
    requirement: 'Author (not apply) a migration that REVOKEs EXECUTE from Bucket A functions FROM PUBLIC, anon, authenticated, and GRANTs TO service_role only',
    description: `Bucket A (6 functions, live-verified 2026-08-15, all currently anon/PUBLIC-executable): ${BUCKET_A.join(', ')}. fn_write_kill_audit_trail was REMOVED from this bucket during PLAN — DATABASE sub-agent found it has a SECURITY INVOKER caller (fn_chairman_decide, prosecdef=false) that runs the inner call AS THE CALLING ROLE, so revoking authenticated would break it; it moved to FR-2/Bucket B instead. log_sd_mutation_audit was ADDED (newly-triaged, a trigger function on strategic_directives_v2 with 0 policies/callers). Every REVOKE statement MUST explicitly name PUBLIC — omitting it is a no-op since anon/authenticated inherit PUBLIC's grant (confirmed live: 14 of the 16 total target functions carry an explicit PUBLIC aclitem).`,
    acceptance_criteria: [
      'Migration file exists under database/chairman-gated/ with @approved-by left blank',
      'For each of the 6 Bucket A functions, the REVOKE statement text contains the literal token PUBLIC in its FROM clause',
      'Post-authoring (not post-apply, since this is chairman-gated) a dry-run parse of the migration confirms exactly 6 REVOKE statements target Bucket A signatures and 6 GRANT...TO service_role statements follow',
    ],
  },
  {
    id: 'FR-2', priority: 'CRITICAL',
    requirement: 'Author the same migration file to REVOKE EXECUTE from Bucket B functions FROM PUBLIC, anon (authenticated explicitly preserved via GRANT)',
    description: `Bucket B (10 functions, live-verified currently anon-exposed, corrected from the original 27-function list — 17 were already closed by prior sibling SDs): ${BUCKET_B.join(', ')}. is_chairman_role was REMOVED from this bucket — DATABASE sub-agent found it's referenced by a roles={public} policy on archetype_benchmarks_admin, which includes anon per the SD's own Bucket-C exclusion rule; it moved to Bucket C (FR-3). fn_write_kill_audit_trail was ADDED (moved from Bucket A per FR-1's finding).`,
    acceptance_criteria: [
      'For each of the 10 Bucket B functions, the REVOKE statement FROM clause contains PUBLIC and anon but NOT authenticated',
      'A GRANT EXECUTE ... TO authenticated statement exists for every Bucket B function in the same migration, restoring/confirming the grant the REVOKE PUBLIC clears',
      'None of the 10 Bucket B signatures appear in the Bucket A REVOKE block (mutual exclusivity assertion)',
    ],
  },
  {
    id: 'FR-3', priority: 'CRITICAL',
    requirement: 'The migration must not touch any Bucket C function — 11 functions verified byte-identical before and after',
    description: 'Bucket C (11 functions: the original 9 anon-facing-policy-backed/genuinely-external-integration functions, PLUS is_chairman_role moved here from Bucket B per FR-2\'s finding, PLUS fn_anon_ingress_prior_hour_count(text) newly-triaged as the anon ingress bound backing feedback::anon_feedback_ingress_bounds). This is a deliberate, verified exclusion — a security fix that breaks fn_relay_insert_sms_candidate (almost certainly the Twilio inbound webhook) is not a net improvement.',
    acceptance_criteria: [
      'The migration file contains zero REVOKE/GRANT statements referencing any of the 11 Bucket C function names',
      'An in-transaction verify block asserts pg_proc ACL for all 11 Bucket C functions matches the pre-migration baseline exactly, RAISE EXCEPTION on any drift',
      'The migration explicitly documents WHY each Bucket C function is excluded (anon-facing-policy vs. external-integration vs. genuinely unplaced-treated-as-external) in a header comment',
    ],
  },
  {
    id: 'FR-4', priority: 'HIGH',
    requirement: 'Scope ALTER DEFAULT PRIVILEGES to actually prevent recurrence, with an empirical self-test proving it worked',
    description: 'The naive fix (REVOKE FROM PUBLIC only, or FROM PUBLIC, anon) may be INSUFFICIENT: DATABASE sub-agent found pg_default_acl for (postgres, public, functions) already OMITS PUBLIC yet functions still receive PUBLIC grants (natural experiment: log_sd_mutation_audit\'s migration has zero GRANT statements but shows a full PUBLIC+anon+authenticated+service_role ACL) — meaning Postgres\'s built-in acldefault() PUBLIC grant may be ADDITIVE to, not replaced by, the pg_default_acl row, which cannot be settled via read-only queries (exec_sql blocks DDL). The migration must include a self-test: CREATE a throwaway function immediately after the ALTER DEFAULT PRIVILEGES statement, read its proacl, assert no PUBLIC/anon grant present, DROP it, RAISE EXCEPTION if the assumption doesn\'t hold. Also scope explicitly to role=postgres only (a second pg_default_acl row exists for role=supabase_admin, currently harmless since all 759 public functions are postgres-owned, but must be an explicit in-scope/out-of-scope decision, not silence).',
    acceptance_criteria: [
      'Migration includes ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon',
      'Migration includes a throwaway-function self-test block that RAISE EXCEPTIONs if the new default still grants PUBLIC or anon EXECUTE',
      'Migration header explicitly states whether the supabase_admin default-privilege row is in scope (and why/why not)',
    ],
  },
  {
    id: 'FR-5', priority: 'CRITICAL',
    requirement: 'Extend scripts/audit-rpc-execute-grants.mjs so it can observe the anon/PUBLIC axis this migration actually changes, plus a completeness gate',
    description: 'The existing script (116 lines) only ever asserts has_function_privilege(\'authenticated\', ...) — it has zero anon/PUBLIC dimension, so it reports green whether this migration\'s actual fix (revoking anon) worked or not. Extend in place (preserves its original authenticated-grant-drift purpose) with: A1 Bucket A assertions (not anon, not authenticated, no PUBLIC aclitem), A2 Bucket B assertions (not anon, no PUBLIC, IS authenticated), A3 Bucket C assertions (byte-identical to a captured baseline), A4 a completeness gate that FAILs if any live anon-executable SECURITY DEFINER function is absent from a declared bucket manifest (converts the "floor not ceiling" problem into a mechanical, permanent check). Also fix the EHG_APP_SRC resolution bug (silently falls back to a stale 24-name list when run from inside a worktree) by resolving from applications.local_path and exiting 1 rather than degrading silently, and add an exec_sql REST fallback path so the script still runs while the Postgres pooler credential is broken.',
    acceptance_criteria: [
      'A test run of the extended script against TODAY\'s live grant state (before this migration is ever applied) FAILS on at least the 16 target functions — a P0 mutation-style test proving the extension is not vacuous',
      'A manifest file (scripts/audit-rpc-execute-grants-buckets.json) exists keyed by exact function signature, each entry carrying a non-empty reason field',
      'Running the script with EHG_APP_SRC unset from inside a worktree either resolves the correct path via applications.local_path or exits 1 — it never silently falls back to the stale 24-name list',
    ],
  },
  {
    id: 'FR-6', priority: 'HIGH',
    requirement: 'Author a CI-parseable standing check preventing future SECURITY DEFINER functions from being created without an explicit REVOKE',
    description: 'New lint: scripts/lint/secdef-execute-revoke-lint.mjs + secdef-execute-revoke-allowlist.json (entries require a non-empty reason), wired as npm run lint:secdef-execute-revoke and a GitHub Actions workflow with a paths: filter. Parses CREATE [OR REPLACE] FUNCTION ... SECURITY DEFINER and requires a same-file REVOKE ... FROM <list containing PUBLIC> — PUBLIC missing from the FROM list is itself a violation even when anon/authenticated are present, catching exactly the FR-1 no-op defect class at authoring time rather than after the fact. Scope must cover the UNION of database/migrations/, supabase/migrations/, AND database/chairman-gated/ (DESIGN sub-agent found the existing rls-anon-tenant-predicate-lint.mjs scopes to database/migrations/ only and would be blind to this SD\'s own migration, which lives in database/chairman-gated/) — --diff mode blocking, --all mode advisory (137 pre-existing functions would otherwise block every unrelated PR).',
    acceptance_criteria: [
      'A seeded fixture migration with CREATE FUNCTION ... SECURITY DEFINER and no REVOKE statement is caught by the lint in --diff mode',
      'A seeded fixture migration with a REVOKE naming only anon/authenticated (omitting PUBLIC) is caught as a violation, not treated as compliant',
      'A seeded fixture migration under database/chairman-gated/ (not database/migrations/) is scanned — proving the scope covers all three directories',
      'A compliant seeded fixture (SECURITY DEFINER + correct REVOKE including PUBLIC) passes',
    ],
  },
  {
    id: 'FR-7', priority: 'HIGH',
    requirement: 'Author a paired rollback migration from a freshly-captured pre-apply ACL baseline',
    description: 'This is a one-shot chairman-ceremony apply EXEC cannot re-enter if something breaks. Author the paired _DOWN.sql restoring the exact pre-apply ACL, matching house convention (20260602_pin_search_path_security_definer_functions_rollback.sql and the predecessor migration 20260728_revoke_public_execute_role_flag_rpcs.sql both ship this way). The baseline must be RE-CAPTURED live immediately before the chairman applies (not reused from PLAN-phase measurements), since sibling migrations may land first and shift the true state.',
    acceptance_criteria: [
      'A _DOWN.sql (or equivalently-named rollback file) exists alongside the forward migration',
      'The rollback file restores GRANT statements for every one of the 16 target functions to their PRE-migration state (PUBLIC/anon/authenticated/service_role as measured, not assumed)',
      'The migration header documents the exact procedure for re-capturing a fresh baseline immediately before apply (not reusing the PLAN-phase measurement)',
    ],
  },
];

const technical_requirements = [
  {
    id: 'TR-1',
    requirement: 'All live grant verification during PLAN/EXEC uses supabase.rpc(\'exec_sql\', { sql_text: \'<SQL>\' }) via the REST client with the service-role key, never the Postgres pooler',
    rationale: 'The pooler credential (SUPABASE_DB_PASSWORD / SUPABASE_POOLER_URL) is broken in this environment (28P01 password authentication failed), confirmed on both a fresh script and the existing canonical scripts/audit-rpc-execute-grants.mjs itself, and signaled as a harness-bug. exec_sql is a verified-working substitute for read-only catalog queries (param name is sql_text, not sql); it rejects DDL (GRANT/REVOKE), so rollback-file authoring must assemble those statements client-side from queried data, not execute them via exec_sql.',
  },
  {
    id: 'TR-2',
    requirement: 'The migration is a Tier-2 (FORBIDDEN_TOPLEVEL) chairman-gated deliverable — @approved-by stays blank, EXEC never applies it',
    rationale: 'scripts/lib/migration-tier-classifier.mjs:44 lists GRANT/REVOKE in FORBIDDEN_TOPLEVEL, so classifyMigration() returns tier:2 for both the REVOKE and ALTER DEFAULT PRIVILEGES statements regardless of file location — placement under database/chairman-gated/ is for convention/co-location with the _DOWN.sql and acceptance-artifact files, not the actual safety control (the tier classifier itself is). Confirmed live this session; an earlier DESIGN sub-agent finding that migrations auto-apply from database/migrations/ was investigated and found FALSE — filed and corrected in place rather than left standing.',
  },
  {
    id: 'TR-3',
    requirement: 'The chairman-facing acceptance artifact for this migration follows the existing database/chairman-gated/<migration>_acceptance.mjs convention (3 precedents already exist in this repo)',
    rationale: 'DESIGN sub-agent found this convention already established; the acceptance artifact must print the verified function list BY NAME (never a bare count) per the SD\'s own stated principle ("authorization given against a verified list, not a category"), distinguish DECLARED grant from EFFECTIVE exposure (has_function_privilege cannot itself distinguish a direct grant from PUBLIC-inheritance), and surface both bucket-placement reversals (FR-1\'s fn_write_kill_audit_trail move, FR-2\'s is_chairman_role move) explicitly rather than silently.',
  },
  {
    id: 'TR-4',
    requirement: 'The extended verifier (FR-5) and the new standing lint (FR-6) are two independent enforcement sites on two different observability axes, and neither alone is sufficient',
    rationale: 'The lint is a text scan over migration files — it cannot see a SECURITY DEFINER function created via the Supabase dashboard SQL editor, outside any migration file. The verifier\'s completeness gate (A4) measures the live catalog directly and would catch that case. DATABASE sub-agent explicitly designed both together for this reason; documenting each one\'s blind spot in its own header is part of the deliverable, not optional.',
  },
  {
    id: 'TR-5',
    requirement: 'No UI work is required — the closest existing surface (/security in the ehg app) is confirmed the wrong one and must not be extended for this SD',
    rationale: 'DESIGN sub-agent independently verified (correcting an initial false read caused by Next.js App Router file conventions inside a Vite app) that a chairman-reachable /security page exists but has zero grant/privilege vocabulary, renders explicitly-labeled mock data (ComprehensiveSecurityDashboard.tsx: "For demo purposes..."), and its live data path 404s (fetch(\'/api/security/overview\') has no matching route in EHG_Engineer, which serves no UI at all). Putting a real chairman-gated verdict beside fabricated threat rows would let the mock data borrow false credibility — the correct chairman-facing surface is the acceptance-artifact script (TR-3), not this dashboard.',
  },
];

const system_architecture = {
  overview: 'Three independently-testable deliverables around one chairman-gated migration file: (1) the migration itself (REVOKE/GRANT statements + scoped ALTER DEFAULT PRIVILEGES + in-transaction verify block + throwaway-function self-test), (2) an extended regression verifier (scripts/audit-rpc-execute-grants.mjs) that can observe both the authenticated axis (its original purpose) and the anon/PUBLIC axis (this SD\'s actual fix) plus a completeness gate against the live catalog, (3) a new CI standing lint (scripts/lint/secdef-execute-revoke-lint.mjs) that is a text-scan safety net for future migrations, on a different observability axis than the verifier. A paired rollback file and a chairman-facing acceptance artifact complete the deliverable set.',
  components: [
    { name: 'Migration file', responsibility: 'REVOKE EXECUTE (Bucket A/B, with PUBLIC always included), unchanged Bucket C, scoped ALTER DEFAULT PRIVILEGES with an empirical self-test, in-transaction verify block', technology: 'PostgreSQL DDL, database/chairman-gated/ convention' },
    { name: 'Rollback file (_DOWN.sql)', responsibility: 'Restore exact pre-apply ACL from a freshly-captured baseline', technology: 'PostgreSQL DDL' },
    { name: 'Extended audit-rpc-execute-grants.mjs', responsibility: 'Post-apply verification across authenticated (existing) + anon/PUBLIC (new) axes, plus a completeness gate against the live catalog', technology: 'Node.js, supabase-js, has_function_privilege() catalog queries, exec_sql REST fallback' },
    { name: 'secdef-execute-revoke-lint.mjs (new)', responsibility: 'CI-time text scan of migration files for CREATE FUNCTION...SECURITY DEFINER without an explicit REVOKE...FROM PUBLIC', technology: 'Node.js, SQL text parsing, GitHub Actions' },
    { name: 'Chairman acceptance artifact', responsibility: 'Human-readable ceremony packet: verified function list by name, declared-vs-effective exposure table, bucket-reversal flags', technology: 'Node.js, database/chairman-gated/<migration>_acceptance.mjs convention' },
  ],
  data_flow: 'PLAN/EXEC measure live grant state via exec_sql RPC (pooler substitute) -> author migration + rollback + verifier extension + lint against that measured state -> chairman reviews the acceptance artifact (verified list, not a category) -> chairman runs scripts/apply-migration.js --prod-deploy (3-factor, currently blocked by the same broken pooler credential used for the single-use-token check — a signaled, tracked operational dependency, not an EXEC blocker) -> post-apply, the extended verifier confirms the anon axis actually changed and Bucket C did not.',
  integration_points: ['scripts/audit-rpc-execute-grants.mjs (extended, not replaced)', 'scripts/lib/migration-tier-classifier.mjs (FORBIDDEN_TOPLEVEL gate, already covers GRANT/REVOKE)', 'scripts/apply-migration.js --prod-deploy (chairman 3-factor path, currently blocked by the broken pooler credential)', 'database/chairman-gated/ convention (3 existing precedents)'],
};

const test_scenarios = [
  { id: 'TS-1', scenario: 'Extended verifier run against TODAY\'s live state (before migration applied) must FAIL on all 16 target functions', test_type: 'integration', given: 'The migration has not been applied; all 16 target functions are still anon/PUBLIC-executable per the live baseline', when: 'scripts/audit-rpc-execute-grants.mjs (extended) is run', then: 'It reports FAIL for all 16 functions on the anon axis — proving the extension is not vacuous (a P0 mutation-style test)' },
  { id: 'TS-2', scenario: 'Bucket A REVOKE statement omitting PUBLIC is caught as a defect by the new lint', test_type: 'unit', given: 'A seeded fixture migration file with CREATE FUNCTION ... SECURITY DEFINER and REVOKE EXECUTE ... FROM anon, authenticated (PUBLIC omitted)', when: 'scripts/lint/secdef-execute-revoke-lint.mjs --diff runs against the fixture', then: 'It reports a violation naming the missing PUBLIC token, not a pass' },
  { id: 'TS-3', scenario: 'A compliant fixture migration passes the new lint', test_type: 'unit', given: 'A seeded fixture migration with CREATE FUNCTION ... SECURITY DEFINER and REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated', when: 'The lint runs against it', then: 'It reports zero violations' },
  { id: 'TS-4', scenario: 'The lint scans database/chairman-gated/, not just database/migrations/', test_type: 'unit', given: 'A seeded fixture placed under database/chairman-gated/ instead of database/migrations/', when: 'The lint runs in --all mode', then: 'The chairman-gated fixture is included in the scan (proving the scope fix from FR-6 works, not just database/migrations/)' },
  { id: 'TS-5', scenario: 'The ADP self-test correctly detects whether the recurrence fix worked', test_type: 'integration', given: 'A migration with the ALTER DEFAULT PRIVILEGES statement followed by a throwaway CREATE FUNCTION', when: 'The throwaway function\'s proacl is read immediately after creation', then: 'If PUBLIC or anon EXECUTE is present, the migration RAISE EXCEPTIONs and the whole transaction rolls back rather than silently completing with a non-working recurrence fix' },
  { id: 'TS-6', scenario: 'Bucket C functions are provably untouched', test_type: 'integration', given: 'A captured pre-migration ACL baseline for all 11 Bucket C functions', when: 'The migration\'s in-transaction verify block runs post-REVOKE/GRANT statements', then: 'It asserts byte-identical ACL for all 11 and RAISE EXCEPTIONs on any drift, aborting the transaction' },
  { id: 'TS-7', scenario: 'fn_write_kill_audit_trail retains authenticated EXECUTE (the corrected Bucket A->B placement)', test_type: 'integration', given: 'fn_write_kill_audit_trail is now in Bucket B (REVOKE FROM PUBLIC, anon only) per the corrected triage', when: 'The migration is authored and its verify block checked', then: 'has_function_privilege(\'authenticated\', fn_write_kill_audit_trail, \'EXECUTE\') remains true post-migration, so fn_chairman_decide (its SECURITY INVOKER caller) is not broken' },
  { id: 'TS-8', scenario: 'The completeness gate (A4) catches a SECURITY DEFINER function outside every declared bucket', test_type: 'security', given: 'A live anon-executable SECURITY DEFINER function exists that is not in the Bucket A/B/C manifest (simulating the C5 floor-not-ceiling scenario)', when: 'The extended verifier runs its completeness check', then: 'It FAILS loudly rather than silently ignoring the unbucketed function' },
];

const acceptance_criteria = [
  'The authored migration\'s REVOKE statements for all 16 target functions (Bucket A + Bucket B) include PUBLIC explicitly in every FROM clause',
  'The authored migration leaves all 11 Bucket C functions untouched, verified by an in-transaction assertion against a captured pre-migration baseline',
  'The extended scripts/audit-rpc-execute-grants.mjs FAILS when run against the current (pre-migration) live state for all 16 target functions, proving the anon-axis check is real and not vacuous',
  'A paired rollback file exists, capable of restoring the exact pre-migration ACL for all 16 target functions',
  'The new CI standing check (secdef-execute-revoke-lint.mjs) catches a seeded PUBLIC-omitted violation and passes a seeded compliant fixture, scoped across database/migrations/, supabase/migrations/, AND database/chairman-gated/',
  'The migration file has @approved-by left blank and is not applied by EXEC — the chairman ceremony path is the only apply mechanism',
];

const risks = [
  {
    risk: 'The ALTER DEFAULT PRIVILEGES fix may not actually work as scoped — Postgres/Supabase\'s built-in PUBLIC default grant may be additive to pg_default_acl, unprovable via read-only queries',
    probability: 'MEDIUM', impact: 'HIGH',
    mitigation: 'Embed an empirical self-test directly in the migration: create a throwaway function post-ADP-change, inspect its proacl, RAISE EXCEPTION if the assumption doesn\'t hold — this converts an unverifiable claim into a proof that runs at apply time, inside the same transaction the chairman approves.',
    rollback_plan: 'If the self-test fails, the transaction aborts automatically (RAISE EXCEPTION rolls back BEGIN...COMMIT) — no partial state, no separate rollback action needed for this specific failure mode.',
  },
  {
    risk: 'A bucket placement is subtly wrong for a function this SD\'s scan (even after two rounds of correction) still missed, breaking a real caller in production',
    probability: 'LOW', impact: 'HIGH',
    mitigation: 'The chairman ceremony is the final human checkpoint against a verified list (not a category), per the SD\'s own explicit design; the paired rollback restores the exact pre-apply state; the extended verifier\'s completeness gate (A4) is a permanent, mechanical guard against exactly this failure mode going forward.',
    rollback_plan: 'Apply the paired _DOWN.sql migration, restoring the captured pre-apply ACL baseline for all 16 functions.',
  },
  {
    risk: 'The chairman ceremony itself is currently blocked — scripts/apply-migration.js --prod-deploy\'s single-use-token check requires a live pooler connection, and that credential is broken',
    probability: 'HIGH (already occurring)', impact: 'MEDIUM',
    mitigation: 'This is an operational dependency outside EXEC\'s control, already signaled as a harness-bug. It does not block PLAN/EXEC deliverable work (authoring the migration, verifier, lint, rollback, tests) — only the final chairman-approved apply step, which is separately gated regardless. Track and resolve before the ceremony is scheduled, not before EXEC work proceeds.',
    rollback_plan: 'N/A — no apply has occurred; nothing to roll back while this dependency is unresolved.',
  },
  {
    risk: 'Extending scripts/audit-rpc-execute-grants.mjs in place (rather than writing a new script) could silently change its existing authenticated-axis behavior and mask an unrelated grant-drift regression it currently catches',
    probability: 'LOW', impact: 'MEDIUM',
    mitigation: 'The existing authenticated-axis assertion (its original purpose, per SD-LEO-FIX-AUDIT-RESTORE-EXECUTE-001) must remain a first-class, independently-tested assertion in the extended script — new anon/PUBLIC/completeness assertions are additive, not replacements. Existing tests/callers of the script must continue passing unmodified.',
    rollback_plan: 'Revert the extension commit; the original authenticated-only script remains functional as a fallback.',
  },
];

const implementation_approach = {
  phases: [
    { phase: 'Phase 1: Live re-measurement', description: 'Re-confirm the 16-function residual and corrected bucket membership against the live catalog via exec_sql, immediately before authoring (state may have shifted since PLAN-phase measurement)', deliverables: ['Fresh ACL baseline for all 16 target + 11 Bucket C functions'] },
    { phase: 'Phase 2: Migration + rollback authoring', description: 'Author the corrected forward migration (FR-1 through FR-4) and its paired rollback (FR-7) under database/chairman-gated/, using SD-MAN-FIX-SECURITY-GUARD-PACK-001 and SD-LEO-FIX-CLOSE-ANON-VENTURE-001 as the exact REVOKE/GRANT ordering template', deliverables: ['Forward migration file (unapplied, @approved-by blank)', 'Paired _DOWN.sql rollback file'] },
    { phase: 'Phase 3: Verifier extension', description: 'Extend scripts/audit-rpc-execute-grants.mjs per FR-5, prove non-vacuity against today\'s live (pre-migration) state', deliverables: ['Extended verifier script', 'Bucket manifest JSON', 'Passing TS-1/TS-7/TS-8 tests'] },
    { phase: 'Phase 4: Standing CI check', description: 'Author the new lint per FR-6, wire into CI', deliverables: ['scripts/lint/secdef-execute-revoke-lint.mjs', 'Allowlist JSON', 'GitHub Actions workflow', 'Passing TS-2/TS-3/TS-4 tests'] },
    { phase: 'Phase 5: Chairman acceptance artifact', description: 'Author the ceremony packet per TR-3, surfacing the verified list by name and both bucket-reversal flags', deliverables: ['database/chairman-gated/<migration>_acceptance.mjs'] },
  ],
  technical_decisions: [
    'Extend scripts/audit-rpc-execute-grants.mjs rather than write a parallel verifier — preserves its proven authenticated-axis purpose and avoids two divergent sources of truth for grant state',
    'Embed the ADP self-test inside the migration transaction rather than as a separate post-apply script — makes an otherwise-unprovable claim (does the built-in PUBLIC default get suppressed) into an atomic, chairman-witnessed proof',
    'fn_write_kill_audit_trail moves Bucket A -> B and is_chairman_role moves Bucket B -> C based on live-verified caller/policy evidence found during PLAN, not the original LEAD-phase triage — corrected before authoring, not after a production break',
    'Do not extend the /security dashboard in the ehg app — it is demo-grade mock data with a 404ing API, and the correct chairman-facing surface is the acceptance artifact script, matching an existing 3-precedent house convention',
  ],
};

const integration_operationalization = {
  consumers: [
    { name: 'Chairman (ceremony approver)', interaction: 'Reviews the acceptance artifact (verified function list by name, bucket reversals flagged) and runs scripts/apply-migration.js --prod-deploy under the 3-factor gate', frequency: 'once, at apply time' },
    { name: 'Future developers creating SECURITY DEFINER functions', interaction: 'Blocked by the new CI lint (FR-6) if they omit an explicit REVOKE...FROM PUBLIC', frequency: 'every PR touching a migration file' },
    { name: 'CI pipeline', interaction: 'Runs the new lint in --diff mode on every PR touching database/migrations/, supabase/migrations/, or database/chairman-gated/', frequency: 'per PR' },
  ],
  dependencies: [
    { name: 'scripts/apply-migration.js --prod-deploy 3-factor token check', type: 'downstream', contract: 'Requires a live Postgres pooler connection for its single-use-token check', failure_mode: 'Currently BROKEN (pooler credential auth failure, signaled harness-bug) — blocks the eventual chairman ceremony, not EXEC deliverable work' },
    { name: '3 sibling completed SDs (SD-MAN-FIX-SECURITY-GUARD-PACK-001, SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001, SD-LEO-FIX-CLOSE-ANON-VENTURE-001)', type: 'upstream', contract: 'Already applied part of the corrected REVOKE/GRANT pattern to overlapping functions; this SD\'s live re-measurement must account for their effect', failure_mode: 'If re-measurement is skipped, the migration could attempt a redundant or conflicting REVOKE against an already-corrected function' },
    { name: 'exec_sql RPC (supabase.rpc(\'exec_sql\', {sql_text}))', type: 'upstream', contract: 'Read-only catalog query substitute for the broken pooler; rejects DDL', failure_mode: 'If this RPC is also disabled/removed, live verification has no working path until the pooler credential is fixed' },
  ],
  data_contracts: [
    { contract_name: 'venture_nursery.pbn_verdict-style bucket manifest (scripts/audit-rpc-execute-grants-buckets.json)', schema: 'Array of {signature, bucket: A|B|C, reason} keyed by exact pg_get_function_identity_arguments signature', validation: 'The completeness gate (A4) cross-checks this manifest against the live catalog', versioning: 'Updated in the same PR as any future bucket-membership change' },
  ],
  runtime_config: {
    environment_variables: ['EHG_APP_SRC (audit-rpc-execute-grants.mjs, must resolve via applications.local_path, not silently fall back)', 'SUPABASE_SERVICE_ROLE_KEY (for exec_sql RPC path)'],
    feature_flags: [],
    deployment_considerations: 'Migration is chairman-gated (Tier-2, FORBIDDEN_TOPLEVEL classification) — never applied by EXEC or any automated pipeline. The lint and verifier extension ship as normal code, independent of the migration\'s apply state.',
  },
  observability_rollout: {
    monitoring: ['Post-apply: extended verifier run output (per-function anon/authenticated/PUBLIC state)', 'CI lint pass/fail on future migration PRs'],
    alerts: ['Any CI lint failure on a PR touching database/migrations/, supabase/migrations/, or database/chairman-gated/'],
    rollout_strategy: 'Verifier extension and CI lint ship as normal PRs (no rollout risk — additive checks). Migration apply is a single chairman-witnessed ceremony, not a phased rollout.',
    rollback_trigger: 'Any post-apply verifier failure, or any app-facing 403 traced to this migration',
    rollback_procedure: 'Apply the paired _DOWN.sql (FR-7), restoring the freshly-captured pre-apply ACL baseline',
  },
};

const exploration_summary = {
  files_read: [
    'scripts/audit-rpc-execute-grants.mjs', 'scripts/lib/migration-tier-classifier.mjs', 'scripts/lib/supabase-connection.js',
    'scripts/harness/s20-fixture.mjs', 'scripts/lint/rls-anon-tenant-predicate-lint.mjs',
    'database/migrations/20260728_revoke_public_execute_role_flag_rpcs.sql (commit 13d02e18d81, unmerged)',
    'database/migrations/20260611_guard_pack_secdef_fns.sql', 'database/migrations/20260603_03_revoke_secdef_execute_from_anon_authenticated.sql',
    'database/chairman-gated/20260815_venture_user_feedback_ownership_rpc.sql', 'database/migrations/20260602_pin_search_path_security_definer_functions_rollback.sql',
    'src/routes/featureRoutes.tsx, app/security/page.tsx, ComprehensiveSecurityDashboard.tsx (ehg app)',
  ],
  patterns_identified: [
    'database/chairman-gated/ convention for non-delegable permission migrations, with paired _DOWN.sql and _acceptance.mjs artifacts (3+ precedents)',
    'REVOKE EXECUTE ... FROM PUBLIC, anon[, authenticated] / GRANT ... TO service_role[, authenticated] as the house-correct pattern (SD-MAN-FIX-SECURITY-GUARD-PACK-001)',
    'A migration with zero explicit GRANT statements still inherits the built-in PUBLIC default (log_sd_mutation_audit natural experiment) — the source of the C2/FR-4 ADP uncertainty',
  ],
  key_decisions: [
    'Extend the existing verifier rather than duplicate it (dedup discipline, avoids two sources of truth)',
    'Move fn_write_kill_audit_trail Bucket A->B and is_chairman_role Bucket B->C based on live-verified evidence found during PLAN, correcting both the original scan and the LEAD-phase corrections',
    'Do not attempt to resolve the broken pooler credential as part of this SD — signaled separately, tracked as an operational dependency for the eventual chairman ceremony only',
  ],
  exploration_date: '2026-08-16',
};

const { data: existing } = await supabase.from('product_requirements_v2').select('id').eq('id', PRD_ID).maybeSingle();
if (existing) throw new Error(`PRD ${PRD_ID} already exists`);

const { data: inserted, error } = await supabase.from('product_requirements_v2').insert({
  id: PRD_ID,
  sd_id: SD_ID,
  directive_id: SD_ID,
  title: 'PRD: Close the remaining SECURITY DEFINER EXECUTE exposure',
  status: 'approved',
  executive_summary,
  functional_requirements,
  technical_requirements,
  system_architecture,
  test_scenarios,
  acceptance_criteria,
  risks,
  implementation_approach,
  integration_operationalization,
  exploration_summary,
}).select('id, status').maybeSingle();
if (error) throw error;
console.log('PRD created:', inserted.id, '| status:', inserted.status);
