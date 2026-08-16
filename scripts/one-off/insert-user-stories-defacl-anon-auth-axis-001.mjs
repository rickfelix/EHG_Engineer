#!/usr/bin/env node
// User stories for SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001, one per FR, each with real
// implementation_context (BMAD requires >=80% coverage; every story gets one here).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001';
const SD_UUID = '6b32a991-f177-467b-b1a3-8f053519f6e1';
const PRD_ID = `PRD-${SD_KEY}`;

const stories = [
  {
    n: 1,
    title: 'Stage per-role default-ACL REVOKE for postgres and supabase_admin',
    user_role: 'Chairman (ceremony operator)',
    user_want: 'a staged, chairman-gated migration that revokes anon/authenticated/PUBLIC EXECUTE from the two roles that mint new functions in schema public',
    user_benefit: 'every new function created after ceremony apply is anon/authenticated-EXEC-closed by default, ending the recurrence engine behind repeated SECDEF findings',
    priority: 'critical',
    points: 3,
    acceptance_criteria: [
      { scenario: 'Per-role form present', given: 'the staged SQL file', when: 'inspected for ALTER DEFAULT PRIVILEGES statements', then: 'exactly 2 statements exist, each with a FOR ROLE clause naming postgres or supabase_admin' },
      { scenario: 'Blank approver header', given: 'the staged SQL file', when: '@approved-by header is read', then: 'it is present but blank, matching migration-guards.js APPROVED_BY_RE' },
    ],
    implementation_context:
      '## Implementation Guidance\n\n**File**: database/chairman-gated/<date>_defacl_anon_auth_axis.sql (new).\n\n' +
      '**Content**: two blocks, one per role:\n```sql\nALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, PUBLIC;\nALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, PUBLIC;\n```\n' +
      '**Do NOT** omit the `FOR ROLE` clause (ADP-IN-SCHEMA=ADD-ONLY trap -- confirmed live in this SD\'s mechanism verification: pg_default_acl already carries by-name anon/authenticated grants per creator role).\n\n' +
      '**Header template**: copy database/chairman-gated/20260815_venture_user_feedback_ownership_rpc.sql\'s header block (CHAIRMAN-GATED banner, blank @approved-by, BEGIN/SET LOCAL lock_timeout/COMMIT wrapper).\n\n' +
      '**Verification (read-only, safe to run now)**: scripts/one-off/verify-defacl-anon-auth-axis-mechanism-001.mjs already confirms the current by-name grant shape this migration targets -- reuse its query pattern (single-line SQL via exec_sql RPC) rather than the broken direct pooler connection.',
  },
  {
    n: 2,
    title: 'Extend the buckets manifest and stage the existing-surface triage REVOKE',
    user_role: 'Security-focused maintainer',
    user_want: 'the existing 28 anon-EXEC / 41 authenticated-EXEC / 18 literal-PUBLIC functions in public triaged into a documented KEEP/REVOKE manifest, with a staged REVOKE migration for the REVOKE set',
    user_benefit: 'the currently-live exposure shrinks to an evidence-backed KEEP set instead of being left open indefinitely waiting on the future-scoped default-ACL fix alone',
    priority: 'critical',
    points: 5,
    acceptance_criteria: [
      { scenario: 'Manifest covers full surface', given: 'scripts/audit-rpc-execute-grants-buckets.json', when: 'compared to a live census re-run at authoring time', then: 'every anon/authenticated/PUBLIC-EXEC function in public is present with bucket A/B/C' },
      { scenario: 'Binding KEEP declared', given: 'the extended manifest', when: 'searched for fn_submit_venture_user_feedback', then: 'it is present with bucket=C and a documented caller' },
    ],
    implementation_context:
      '## Implementation Guidance\n\n**Files**: scripts/audit-rpc-execute-grants-buckets.json (extend, do not replace), database/chairman-gated/<date>_defacl_anon_auth_axis_triage.sql (new).\n\n' +
      '**Re-measure first**: re-run the live census (single-line exec_sql RPC queries, see scripts/one-off/verify-defacl-anon-auth-axis-mechanism-001.mjs:28-37 for the working query pattern) since the 28/41/18 snapshot may have shifted since 2026-08-16.\n\n' +
      '**KEEP starting set** (from Explore\'s finding, scripts/audit-rpc-execute-grants-buckets.json Bucket C + this SD\'s binding constraint): fn_is_chairman, fn_user_has_venture_access, fn_is_service_role, is_leo_admin, check_feedback_rate_limit, venture_exists_and_active, is_chairman_role, fn_relay_insert_sms_candidate, fn_anon_ingress_prior_hour_count, PLUS fn_submit_venture_user_feedback, fn_submit_venture_feedback, fn_submit_venture_error (currently UNDECLARED -- must be added).\n\n' +
      '**Triage migration**: per-function `REVOKE EXECUTE ON FUNCTION public.<name>(<args>) FROM anon, authenticated;` for the REVOKE set, plus `REVOKE EXECUTE ... FROM PUBLIC;` for the 18 literal-PUBLIC functions -- NEVER a blanket loop (that is the exact bug at database/migrations/20260603_03_..._rollback.sql:19).',
  },
  {
    n: 3,
    title: 'Author exact-restoration DOWN migrations for both staged UP files',
    user_role: 'Chairman (ceremony operator)',
    user_want: 'a tested rollback path for each staged migration that restores the exact pre-apply grant state',
    user_benefit: 'a production issue discovered after ceremony apply can be reverted safely without guesswork or a blanket re-grant that reintroduces the known over-granting bug',
    priority: 'high',
    points: 3,
    acceptance_criteria: [
      { scenario: 'Exact signature enumeration', given: 'the FR-2 DOWN file', when: 'inspected for GRANT statements', then: 'each GRANT names an explicit function signature, with zero ANY(SELECT...) or blanket loops' },
      { scenario: 'Hash round-trip', given: 'a pre-UP catalog hash', when: 'UP then DOWN both apply (fixture)', then: 'post-DOWN hash equals pre-UP hash exactly' },
    ],
    implementation_context:
      '## Implementation Guidance\n\n**Files**: database/chairman-gated/<date>_defacl_anon_auth_axis_DOWN.sql, database/chairman-gated/<date>_defacl_anon_auth_axis_triage_DOWN.sql (new, both).\n\n' +
      '**Template**: database/chairman-gated/20260815_venture_user_feedback_ownership_rpc_DOWN.sql (BEGIN; SET LOCAL lock_timeout; reversal statements; NOTIFY pgrst, \'reload schema\'; COMMIT;).\n\n' +
      '**FR-1 DOWN**: `ALTER DEFAULT PRIVILEGES FOR ROLE <role> IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, PUBLIC;` per role (restores the default, not a REVOKE-of-a-REVOKE).\n\n' +
      '**FR-2 DOWN**: capture the exact pre-apply signature list from the triage migration\'s own REVOKE-set (same list, inverted to GRANT) -- do not re-derive from a fresh catalog scan, since that could pick up unrelated drift.\n\n' +
      '**Hash proof**: `select md5(string_agg(defaclacl::text, \',\' order by rolname,nspname)) from pg_default_acl ...` plus an equivalent aclexplode-based hash per REVOKE-set function oid, compared before-UP / after-UP / after-DOWN.',
  },
  {
    n: 4,
    title: 'Build the two-axis acceptance script with a scope guard',
    user_role: 'PLAN/EXEC verifier',
    user_want: 'one acceptance script that independently proves the future-scoped default-ACL fix and the existing-surface triage, and fails loud if the acceptance claim silently widens to cover the separate public_exec defect',
    user_benefit: 'a false PASS that only ever exercised one axis (or that silently absorbed an unrelated defect\'s fix) is structurally impossible, not just discouraged by review',
    priority: 'critical',
    points: 5,
    acceptance_criteria: [
      { scenario: 'AXIS-1 uses a probe function', given: 'acceptance.mjs --verify', when: 'run against a post-apply fixture', then: 'a create-then-drop probe function is the sole AXIS-1 evidence, not a count over pre-existing functions' },
      { scenario: 'Scope guard fires on drift', given: 'baseline public_exec_count = N', when: 'verify runs and the count differs from N', then: 'the script exits non-zero with an explicit scope-creep message' },
    ],
    implementation_context:
      '## Implementation Guidance\n\n**File**: database/chairman-gated/<date>_defacl_anon_auth_axis_acceptance.mjs (new), modeled on 20260816_close_remaining_secdef_execute_exposure_acceptance.mjs and 20260812_venture_operating_burn_tenant_predicate_acceptance.mjs (--baseline/--verify convention).\n\n' +
      '**Query path**: supabase.rpc(\'exec_sql\', {sql_text}) with SINGLE-LINE SQL text -- the wrapper falsely rejects multi-line/indented text with a 42501 "only allows SELECT/WITH" error (confirmed in scripts/one-off/verify-defacl-anon-auth-axis-mechanism-001.mjs). Direct pooler connect is credential-broken, do not use pg.Client.\n\n' +
      '**AXIS-1 probe**: `create function public._defacl_probe_<random>() returns void language sql as $$select 1$$;` then `has_function_privilege(\'anon\', oid, \'EXECUTE\')` then `drop function`. This is EXEC_SQL-incompatible (DDL) -- name this limitation explicitly and provide the --self-test fixture path as the CI-runnable substitute; the live probe only runs at ceremony time via the chairman\'s own psql session, documented as a manual step in the migration header.\n\n' +
      '**Scope guard**: compute public_exec_count identically in --baseline and --verify; assert equality; message format: `SCOPE_CREEP: public_exec_count changed from <N> to <M> -- this acceptance script must not claim to fix the separate PUBLIC-axis defect (see 20260816_close_remaining_secdef_execute_exposure.sql:16-28)`.',
  },
  {
    n: 5,
    title: 'Unit-test the extended completeness gate with a mutation test',
    user_role: 'Maintainer running the weekly drift check',
    user_want: 'confidence that evaluateBucketCompliance()/findUndeclaredExposures() actually catch an undeclared exposure, proven by a test that injects one and checks it is caught',
    user_benefit: 'the completeness gate cannot silently regress into a vacuous-PASS check the way the underlying mechanism claim itself did before this SD',
    priority: 'high',
    points: 2,
    acceptance_criteria: [
      { scenario: 'Mutation caught', given: 'a synthetic 145-row grant snapshot matching the extended manifest', when: 'one row is mutated to add an undeclared anon-EXEC signature', then: 'findUndeclaredExposures() returns exactly that signature' },
      { scenario: 'No DB dependency', given: 'the unit test suite', when: 'run offline', then: 'all completeness-gate tests pass with zero network calls' },
    ],
    implementation_context:
      '## Implementation Guidance\n\n**File**: tests for scripts/audit-rpc-execute-grants.mjs\'s exported evaluateBucketCompliance()/findUndeclaredExposures() (existing pure functions per Explore/VALIDATION findings) -- add a new describe block, do not create a parallel test file.\n\n' +
      '**Fixture**: build a synthetic array of {schema:\'public\', function, args, anon_exec, authenticated_exec} matching the extended buckets.json 1:1 (all compliant).\n\n' +
      '**Mutation test**: clone the fixture, flip one non-manifest signature\'s anon_exec to true, assert findUndeclaredExposures(mutatedFixture, manifest) includes exactly that signature and evaluateBucketCompliance() reports FAIL; revert and assert PASS.\n\n' +
      '**Scale check**: assert the live query helper builds a valid single-line `ANY(ARRAY[...])` SQL string at 145 elements without truncation or escaping errors.',
  },
  {
    n: 6,
    title: 'Document the governance/portfolio-schema out-of-scope finding',
    user_role: 'Coordinator / follow-on triage owner',
    user_want: 'an explicit, discoverable record that 60 BYPASSRLS-owner SECDEF functions are anon/authenticated-executable across public+governance+portfolio schemas, with this SD covering only the 28+41 public-schema subset',
    user_benefit: 'the governance/portfolio-schema exposure is not silently lost between SDs -- it becomes a clear candidate for a follow-up, properly scoped and fence-reviewed rather than either being ignored or silently absorbed into this SD without coordinator re-approval',
    priority: 'medium',
    points: 1,
    acceptance_criteria: [
      { scenario: 'Named functions recorded', given: 'PRD risks section', when: 'read', then: 'governance.rls_governance_read_policy(), portfolio.kill_switch(...), portfolio.reactivate_venture(...) are named as examples of the out-of-scope set' },
      { scenario: 'Completion-flags routing', given: 'LEAD-FINAL-APPROVAL for this SD', when: 'completion flags are captured', then: 'this finding is routed as a needs_decision or tied_to_sd flag, not silently closed with 0 flags' },
    ],
    implementation_context:
      '## Implementation Guidance\n\n**No code change** -- this story is documentation-only. Verify at EXEC-TO-PLAN that the two staged SQL files (FR-1, FR-2) contain zero governance.*/portfolio.* references (`grep -c "governance\\.\\|portfolio\\." <staged files>` = 0).\n\n' +
      '**Completion flags**: at LEAD-FINAL-APPROVAL, run node scripts/capture-completion-flags.js with a flag of type `needs_decision` or `tied_to_sd` naming the governance/portfolio-schema BYPASSRLS anon-EXEC surface (60 total per the SECURITY sub-agent finding recorded during this SD\'s PRD authoring, sub_agent_execution_results row search: sd_id=6b32a991-f177-467b-b1a3-8f053519f6e1, code=SECURITY).',
  },
];

const rows = stories.map((s) => ({
  story_key: `${SD_KEY}:US-${String(s.n).padStart(3, '0')}`,
  prd_id: PRD_ID,
  sd_id: SD_UUID,
  title: s.title,
  user_role: s.user_role,
  user_want: s.user_want,
  user_benefit: s.user_benefit,
  story_points: s.points,
  priority: s.priority,
  status: 'ready',
  acceptance_criteria: s.acceptance_criteria,
  implementation_context: s.implementation_context,
  validation_status: 'validated',
  created_by: 'Bravo (worker session 698520e6-7b16-46b5-a207-42548fe6a180)',
}));

const supabase2 = supabase;
for (const row of rows) {
  const { data: existing } = await supabase2.from('user_stories').select('id').eq('story_key', row.story_key).maybeSingle();
  let res;
  if (existing) {
    res = await supabase2.from('user_stories').update(row).eq('story_key', row.story_key).select('story_key');
  } else {
    res = await supabase2.from('user_stories').insert(row).select('story_key');
  }
  if (res.error) { console.error('ERR', row.story_key, res.error.message); process.exit(1); }
  console.log('OK', row.story_key);
}
