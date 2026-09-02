#!/usr/bin/env node
/**
 * SD-LEO-FIX-SECURITY-LINTER-SENTINEL-001 — SECURITY review of the STAGED migration set at EXEC.
 *
 * Reviews commit de4eda9d03d (PR #8014). Every claim below was re-measured against live
 * Postgres catalog state and against the real guard functions, not taken on the PR description's
 * word. Nothing was applied.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD = 'SD-LEO-FIX-SECURITY-LINTER-SENTINEL-001';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 94,
  execution_time_ms: 0,
  critical_issues: [],
  warnings: [
    {
      id: 'SEC-1',
      severity: 'MEDIUM',
      issue: 'DO $verify$ in 20260902 emits "VERIFY OK" while scope_completion_chain RLS can still be disabled — the cross-file dependency on 20260616 is asserted in prose only, never in code.',
      evidence: 'The verify block asserts north_star RLS+policy, north_star write grants, scope_completion_chain write grants, and the set_session_awaiting_approval pin. It asserts NOTHING about scope_completion_chain.relrowsecurity or its policy count, because those live in database/migrations/20260616_security_hygiene_rls_searchpath.sql. Measured live 2026-09-02 via pg_class: scope_completion_chain relrowsecurity=false, 0 policies, and anon+authenticated both hold SELECT. If the ceremony applies 20260902 alone, the operator gets a green NOTICE, the rls_disabled_in_public finding for scope_completion_chain stays open, and anon retains unrestricted direct SELECT on the table. The file has "success despite a real gap" by construction.',
      location: 'database/chairman-gated/20260902_security_linter_sentinel_north_star_and_chain.sql:111-163',
      recommendation: 'Add a RAISE EXCEPTION (or at minimum RAISE WARNING) on scope_completion_chain.relrowsecurity=false naming 20260616 as the missing prerequisite, so the file cannot self-report OK when half its stated scope is unapplied.',
    },
    {
      id: 'SEC-2',
      severity: 'LOW',
      issue: 'Both write-grant assertions read information_schema.role_table_grants, a view that filters to "currently enabled roles" — under a non-member applying identity it returns 0 rows and both assertions pass vacuously.',
      evidence: 'Measured live: the apply identity is postgres (current_user=postgres, is_superuser=off), and pg_auth_members shows postgres IS a member of both anon and authenticated, so role_table_grants returns 28 visible rows for these two tables today — the assertion genuinely works on the current apply path. But the honesty of the check is a property of WHO applies it, not of the SQL. Applied as supabase_admin or any non-member, count(*) is 0 and "VERIFY FAILED: still has N write grant(s)" can never fire. aclexplode(pg_class.relacl) carries no such visibility filter and would make the assertion identity-independent.',
      location: 'database/chairman-gated/20260902_security_linter_sentinel_north_star_and_chain.sql:132-150',
      recommendation: 'Rewrite both grant assertions over aclexplode(COALESCE(c.relacl, acldefault(...))) joined to pg_roles, and include grantee=0 (PUBLIC) in the predicate. Same change applies to any future file copying this template.',
    },
    {
      id: 'SEC-3',
      severity: 'LOW',
      issue: 'The north_star policy assertion is count(*) >= 1 over ANY policy — blind to policy name, command and qual.',
      evidence: 'Line 128 asserts v_policy_count >= 1. It would pass if the only policy on north_star were an unrelated permissive FOR ALL TO public USING (true). The CREATE POLICY guard above it is name-scoped (polname = north_star_read_ratified), so it would still create the correct policy in that scenario — but the assertion certifies "a policy exists", while the NOTICE claims "RLS+policy+revoke present". Measured live: north_star currently has 0 policies, so today the guard does create exactly the intended one and the gap is latent, not active.',
      location: 'database/chairman-gated/20260902_security_linter_sentinel_north_star_and_chain.sql:120,128-130',
      recommendation: "Assert EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.north_star'::regclass AND polname='north_star_read_ratified' AND polcmd='r') rather than a bare count.",
    },
    {
      id: 'SEC-4',
      severity: 'LOW',
      issue: "search_path assertion accepts any value matching 'search_path=%', including an empty pin or a hostile schema.",
      evidence: "Line 158 tests x LIKE 'search_path=%'. It would pass on proconfig={search_path=} or {search_path=attacker_schema}. The ALTER FUNCTION two statements above is correct (SET search_path = public, pg_catalog — non-empty, pg_catalog present), and both run in the same apply transaction (scripts/apply-migration.js wraps the file in BEGIN/COMMIT and ROLLBACKs on the verify EXCEPTION), so divergence is not reachable through this file alone. Noted as template weakness, inherited verbatim from 20260616:99.",
      location: 'database/chairman-gated/20260902_security_linter_sentinel_north_star_and_chain.sql:157-160',
      recommendation: "Assert the exact pinned value: 'search_path=public, pg_catalog' = ANY(proconfig).",
    },
    {
      id: 'SEC-5',
      severity: 'INFO',
      issue: 'REFERENCES, TRIGGER and MAINTAIN remain granted to anon and authenticated on all 12 tables after both files apply.',
      evidence: 'Live relacl for every one of the 12 tables reads DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE for both anon and authenticated (the Supabase GRANT ALL default). The REVOKE lists cover INSERT/UPDATE/DELETE/TRUNCATE only. TRIGGER on a table is nominally an escalation surface (CREATE TRIGGER attaching a function that then executes in a privileged writer\'s session), but it is not reachable here: anon/authenticated are NOLOGIN and only ever entered via authenticator SET ROLE through PostgREST, which issues no DDL. The narrower REVOKE list also matches the established 20260731_coordination_receipts_rls_posture.sql precedent that every sibling migration in this remediation follows.',
      location: 'database/chairman-gated/20260902_...:91,97 and 20260831_...:84-93',
      recommendation: 'Leave as-is for this SD — widening the REVOKE for only these 12 tables would fork the repo-wide convention. Worth a separate, repo-wide decision.',
    },
    {
      id: 'SEC-6',
      severity: 'INFO',
      issue: 'The prerequisite 20260616 re-pins fn_advance_venture_stage from its live value to a different search_path ordering.',
      evidence: 'Live pg_proc.proconfig for fn_advance_venture_stage is {search_path=public}; 20260616:69 sets "pg_catalog, public". This SD\'s header correctly states the function is already pinned and that portion is a no-op for the finding class, which is true for the linter predicate. The ordering does change on apply. Behaviour-neutral for a body that qualifies nothing ambiguously, and pg_catalog-first is the safer ordering, so this is a note not an objection. Not a file this SD authored.',
      location: 'database/migrations/20260616_security_hygiene_rls_searchpath.sql:69',
      recommendation: 'No action. Flagged so the ceremony operator is not surprised by a proconfig diff on a function this SD describes as "already pinned".',
    },
  ],
  conditions: [
    'Ceremony operator MUST apply database/migrations/20260616_security_hygiene_rls_searchpath.sql in the same ceremony as 20260902_security_linter_sentinel_north_star_and_chain.sql. Applying 20260902 alone leaves scope_completion_chain with RLS disabled and anon SELECT intact while the file prints "VERIFY OK" (SEC-1).',
    'Ceremony operator MUST also apply database/chairman-gated/20260831_rls_lockdown_triage_three_failing_001.sql and database/migrations/20260831_pin_search_path_log_sd_mutation_audit.sql for the sentinel to reach 0 findings; 20260902 closes only 2 of 12 rls_disabled_in_public findings and 1 of 2 function_search_path_mutable findings.',
    'The apply must be run by an identity that is a member of anon and authenticated (postgres, as measured) or the write-grant assertions in DO $verify$ are vacuous (SEC-2).',
    'Post-apply, re-run `node scripts/sentinels/audit-security-linter.mjs --strict` as the real closure check rather than relying on the in-file NOTICE.',
  ],
  justification: 'CONDITIONAL_PASS, not PASS: the staged DDL is correct, minimal and safe, and every security-specific claim in the review brief verified true against live catalog state. The conditions are entirely about the self-verification block\'s honesty and an unasserted cross-file dependency (SEC-1/SEC-2), not about the posture the DDL produces. Nothing found blocks the chairman ceremony; the operator simply must not read this file\'s "VERIFY OK" as "all 3 finding classes closed".',
  recommendations: [
    'Fix SEC-1 before the ceremony (a ~6-line RAISE in the existing DO $verify$). It is the only finding that can produce a green result over a real, live anon read surface.',
    'SEC-2/SEC-3/SEC-4 are template defects inherited from 20260616 and now copied into 20260902. Fixing them here and back-porting is cheap; leaving them propagates a verify block that is honest only by accident of the applying identity.',
    'No change required to the north_star policy, the REVOKE role lists, the search_path values, or the 20260831 correction — all four verified correct.',
  ],
  detailed_analysis: [
    'SECURITY review at EXEC of the STAGED (unapplied) migration set in commit de4eda9d03d / PR #8014. Nothing was applied by this review. All measurements taken live 2026-09-02 against the engineer DB via scripts/lib/supabase-connection.js createDatabaseClient(engineer, {connectionString: SUPABASE_POOLER_URL||DATABASE_URL}).',
    '',
    'CHECK 1 — north_star policy actually restricts what it should: PASS.',
    'The policy is FOR SELECT (polcmd read), TO anon, authenticated, USING (status = \'chairman_ratified\'). It is NOT FOR ALL. A forged-status write is blocked twice over: (a) the same file REVOKEs INSERT, UPDATE, DELETE, TRUNCATE from anon, authenticated; (b) with RLS enabled and only a SELECT policy present, anon/authenticated have no INSERT/UPDATE/DELETE policy and are denied by RLS default-deny even if a grant were restored. Note TRUNCATE specifically is NOT filterable by RLS in Postgres — it is privilege-only — so the REVOKE is load-bearing rather than belt-and-braces for that one verb, and it is correctly present.',
    'Consumer preservation verified independently rather than trusting the header: ehg repo src/hooks/useNorthStar.ts:45-47 issues .from("north_star").select(...).eq("status","chairman_ratified") — the policy predicate is identical to the consumer filter, so the policy cannot narrow what the live browser client already reads. src/components/eva-chat/intents/northStarIntent.ts:41 gates on the same value. Live data: north_star holds exactly 1 row, status=chairman_ratified — zero read loss on apply.',
    '',
    'CHECK 2 — REVOKE role lists: PASS.',
    'All 12 REVOKE statements across both files (10 in 20260831, 2 in 20260902) read exactly "FROM anon, authenticated". Neither role is omitted anywhere; service_role appears in no REVOKE in this diff, so backend writers are unaffected (and service_role additionally carries rolbypassrls). Live relacl confirms service_role retains full privileges on all 12 tables today.',
    'Completeness check the file does not make: aclexplode over pg_class.relacl for all 12 tables returns grantees anon, authenticated, postgres, service_role and NO PUBLIC (grantee=0) entries. A REVOKE FROM anon, authenticated is therefore sufficient — there is no PUBLIC grant that would survive it and silently keep the write surface open.',
    '',
    'CHECK 3 — search_path values: PASS.',
    'Both pins use SET search_path = public, pg_catalog. Non-empty, and pg_catalog is explicitly present so builtin resolution cannot break. The 20260902 pin targets public.set_session_awaiting_approval(text, boolean); live pg_get_function_identity_arguments returns exactly "p_session_id text, p_clear boolean" and pg_proc holds exactly ONE row for that name — no overload exists that an ALTER of a single signature could silently leave unpinned (a real hazard, since the verify block uses SELECT ... INTO on proname alone, which takes the first row without erroring on multiple).',
    '',
    'CHECK 4 — DO $verify$ honesty: CONDITIONAL. Four scenarios where it reports success over a real gap are recorded as SEC-1 (unasserted scope_completion_chain RLS — the live one), SEC-2 (information_schema visibility filter), SEC-3 (name-blind policy count), SEC-4 (value-blind search_path match). What the block DOES do correctly: north_star RLS uses IS DISTINCT FROM true so a missing table yields NULL and still raises; the proconfig check raises on NULL; apply-migration.js wraps the file in BEGIN/COMMIT and ROLLBACKs on the RAISE, so a genuine failure is loud and leaves no partial state.',
    '',
    'CHECK 5 — no real @approved-by, no --prod-deploy: PASS.',
    'Ran the actual guard, extractApprovedBy() from scripts/lib/migration-guards.js, over all five relevant files. All five return null: 20260902 and 20260831 (chairman-gated) use "<pending -- apply via the chairman\'s 3-factor ceremony>" (APPROVED_BY_RE excludes <>" and requires an @), 20260825 has no @approved-by line at all, 20260831_pin was blanked from the bogus rickfelix@example.com to the same placeholder, 20260616 has an empty value. Every one fails checkApproverFactor with "missing -- @approved-by: <email> header", so factor (c) of the 3-factor prod-deploy guard blocks all five regardless of flag or token. The blanking of rickfelix@example.com is a genuine hardening: that value DID satisfy APPROVED_BY_RE and failed only on the separate git-email equality test.',
    'grep across every commit on the branch (git log -p main..HEAD) for "prod-deploy": 0 occurrences. No apply was invoked.',
    '',
    'CHECK 6 — nothing silently applied to prod: PASS, verified live.',
    'pg_class for all 12 flagged tables (claim_rejects, coverage_matrix, coverage_matrix_rotation_runs, door_routing_ledger, north_star, scope_completion_chain, selection_postures, sourcing_chairman_queue, v_hc_flag_enabled, v_id, v_s22_flag_enabled, venture_preview_instances): every one relkind=r, relrowsecurity=FALSE, relforcerowsecurity=FALSE, 0 policies. pg_proc: log_sd_mutation_audit proconfig=NULL, set_session_awaiting_approval proconfig=NULL, both prosecdef=true. fn_advance_venture_stage proconfig={search_path=public} (pre-existing, matches the header claim). The "still needs the ceremony" claim holds in full.',
    'Incidental: relkind=r on all 12 means the three v_-prefixed names are real tables despite the view-like naming, so 20260831\'s ALTER TABLE ... ENABLE ROW LEVEL SECURITY will not error on them.',
    '',
    'CHECK 7 — 20260831 removal is clean: PASS.',
    'The corrected file now carries exactly 10 ALTER TABLE ... ENABLE ROW LEVEL SECURITY and exactly 10 REVOKE statements; neither list contains north_star or scope_completion_chain. Both names survive only in the CORRECTION prose block and the SCOPE comment. The regression this SD found was real: the pre-existing blanket no-policy enable would have cut off useNorthStar.ts (live anon-key browser consumer, verified above) and the scope_completion_chain UNION branch of public.writer_consumer_asymmetry_witnesses — confirmed live to carry reloptions {security_invoker=on}, so it reads through the caller\'s RLS.',
    'The stated substitute for scope_completion_chain also checks out: 20260616:46-60 does pair ENABLE ROW LEVEL SECURITY with CREATE POLICY scope_completion_chain_read_all FOR SELECT USING (true) and no TO clause, which defaults to PUBLIC and therefore preserves anon+authenticated reads for the witnesses view. The header claim that 20260616 supplies the RLS-enable+policy half is accurate, not assumed.',
    '',
    'CHECK 8 — 20260825 SUPERSEDED note: PASS. Header-only change, no statement diff. The superset claim is accurate: 20260831 covers the same 9 tables plus v_id plus matching REVOKEs. Idempotency claim also holds (ENABLE ROW LEVEL SECURITY on an already-RLS table is a no-op), so applying both is redundant rather than unsafe.',
  ].join('\n'),
  metadata: {
    reviewed_commit: 'de4eda9d03d',
    reviewed_pr: 'https://github.com/rickfelix/EHG_Engineer/pull/8014',
    review_scope: 'STAGED SQL content only — nothing applied',
    live_measurements: {
      tables_checked: 12,
      tables_rls_enabled_live: 0,
      tables_with_policies_live: 0,
      public_role_grants_found: 0,
      log_sd_mutation_audit_proconfig: null,
      set_session_awaiting_approval_proconfig: null,
      set_session_awaiting_approval_overloads: 1,
      fn_advance_venture_stage_proconfig: 'search_path=public',
      north_star_rows: 1,
      north_star_rows_chairman_ratified: 1,
      apply_identity: 'postgres (member of anon+authenticated -> role_table_grants visible)',
    },
    approved_by_extraction: 'null for all 5 files via scripts/lib/migration-guards.js extractApprovedBy()',
    prod_deploy_occurrences_in_branch: 0,
    findings: { MEDIUM: 1, LOW: 3, INFO: 2, CRITICAL: 0, HIGH: 0 },
  },
};

async function main() {
  const resolution = await resolveSubAgentRepo({
    sdId: SD,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
  });
  applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD,
    { name: 'Chief Security Architect', code: 'SECURITY' },
    results,
    { phase: 'EXEC', sdKey: SD },
  );
  console.log('STORED ID:', stored?.id, '| verdict:', stored?.verdict, '| phase:', stored?.phase);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('X', err.message);
    process.exit(1);
  });
}
