import { createDatabaseClient } from '../lib/supabase-connection.js';

const SD_KEY = 'SD-LEO-FIX-SECURITY-LINTER-SENTINEL-001';

const correctedDescription = `## LEAD CORRECTION 2026-09-02T (measured, supersedes the literal Option-A exemption text below)

Independent direct measurement (Hotel, EXEC-phase investigation) found a strictly better and
simpler remediation than the literal Option-A wording ("exempted-tables.json entry citing a
deliberate-no-RLS migration" for 3 tables) requires. All 12 tables can get RLS ENABLED directly
-- no table needs a permanent app-level exemption:

- 9 tables (claim_rejects, coverage_matrix, coverage_matrix_rotation_runs, door_routing_ledger,
  selection_postures, sourcing_chairman_queue, v_hc_flag_enabled, v_s22_flag_enabled,
  venture_preview_instances) + v_id: zero live anon/authenticated consumers (service-role only,
  which bypasses RLS regardless; v_id is a 1-row scratch table with zero code consumers in either
  repo, confirmed via repo grep 2026-09-02) -- bare RLS-enable + REVOKE write grants, staged in
  database/chairman-gated/20260831_rls_lockdown_triage_three_failing_001.sql
  (SD-LEO-FIX-TRIAGE-THREE-FAILING-001, corrected). The sibling
  database/chairman-gated/20260825_enable_rls_chronic_red_guard_zero_consumer_tables.sql
  (SD-LEO-INFRA-CHRONIC-RED-GUARD-001) independently authored the same 9-table ENABLE (without the
  REVOKE) six days earlier -- VALIDATION sub-agent flagged this as duplicate authoring across two
  unrelated SDs; marked SUPERSEDED in place (2026-09-02) rather than deleted, pointing the ceremony
  at 20260831 as the superset. Applying both is non-breaking (idempotent) but redundant.
- north_star: HAS a real live anon-key browser consumer (ehg repo's useNorthStar.ts +
  northStarIntent.ts) -- the migration Adam's earlier note called "documented deliberate no-RLS"
  actually means "not yet remediated", not "permanently exempt". Gets RLS-enable + a real SELECT
  policy scoped to its actual query filter (status='chairman_ratified', confirmed live column) +
  REVOKE write grants -- staged in the new
  database/chairman-gated/20260902_security_linter_sentinel_north_star_and_chain.sql.
- scope_completion_chain: RLS-enable + permissive read policy already staged, unapplied, in
  database/migrations/20260616_security_hygiene_rls_searchpath.sql (confirmed live 2026-09-02 it
  never reached prod: relrowsecurity=false, 0 policies). That file also pins the search_path on
  the SECURITY DEFINER function fn_advance_venture_stage. This SD adds only the companion write-grant
  REVOKE in the new 20260902 file above (avoids duplicating that file's RLS-enable/policy).

CRITICAL FINDING during this investigation: the pre-existing, unapplied
20260831_rls_lockdown_triage_three_failing_001.sql (a different, already-completed SD) had
blindly re-included north_star and scope_completion_chain in a blanket no-policy RLS-enable+revoke
-- a regression against 20260825's own explicit, evidence-based exclusion of both tables for the
same silent-breakage reasons above. Corrected in place (removed both lines from that file, documented
why) before it could reach the chairman ceremony. Signaled critical (spec-conflict, signal
2bc67746-36fe-4191-b30a-bed727a6128e) so no other seat applied it as-is in the interim.

No exempted-tables.json changes are needed -- every one of the 12 flagged tables gets a real,
narrowly-scoped RLS fix instead of an app-level exemption, which is strictly safer (closes every
live anon/authenticated write surface unconditionally; service-role and any future need can still
add a scoped policy later) than encoding "this table never needs RLS" for tables whose own
migrations describe the gap as temporary.

session_id / sensitive_columns_exposed: resolved as a side effect of claim_rejects's RLS-enable
(the sentinel defines sensitive_columns_exposed as "the session_id subset of rls_disabled_in_public"
-- confirmed by reading scripts/sentinels/audit-security-linter.mjs directly). No separate migration
needed.

function_search_path_mutable: CORRECTED 2026-09-02 -- live count is 2, not 1 (VALIDATION sub-agent
caught this during LEAD review). log_sd_mutation_audit's pin already existed, staged and unapplied,
in database/migrations/20260831_pin_search_path_log_sd_mutation_audit.sql (its bogus
rickfelix@example.com @approved-by stamp -- never a real chairman approval -- was blanked). A SECOND,
previously-unaddressed offender was found: set_session_awaiting_approval, a fresh SECURITY DEFINER
regression from database/migrations/20260901_session_awaiting_approval_rpc.sql (2026-09-01, the day
before this SD), never pinned anywhere. Its pin is now included in
database/chairman-gated/20260902_security_linter_sentinel_north_star_and_chain.sql. Separately
confirmed live that fn_advance_venture_stage (which 20260616_security_hygiene_rls_searchpath.sql
also pins) already has its search_path pinned in prod -- that portion of 20260616 is a
behavior-neutral no-op for this finding class; only its scope_completion_chain half is load-bearing.

All migrations are staged only, @approved-by left blank, never applied by the worker -- ceremony
required per database/chairman-gated/README.md, matching the unconditional chairman-pick constraint.

---

## CHAIRMAN PICK: OPTION A (2026-09-02T09:46Z, verbal at the Adam terminal, decision 4643e7f3 approved)
(superseded in mechanism by the LEAD correction above; the underlying disposition -- real RLS
remediation for the flagged tables, worker never applies, chairman ceremony required -- is honored
in full; the literal "exempted-tables.json citation" mechanism is not, because direct measurement
found RLS-enable achievable and strictly safer for every one of the 12 tables, leaving nothing that
needs a permanent exemption.)

## PREMISE CORRECTED 2026-09-02T08:03Z
The original premise inherited from QF-20260901-456 (strict exits 1 on report-only findings) is
FALSE. MEASURED independently by Hotel (signal dddee8f0), Adam and Solomon (08:01Z) from
gh run view 33433241155 --log-failed: the strict step fails on ENFORCED classes:
rls_disabled_in_public = 12 tables, sensitive_columns_exposed = 1, function_search_path_mutable = 1;
the report-only classes (definer_rls_bypass_exposed, pg_net_exposure) are already excluded.

Expected: The scheduled run reads green when the guard it implements is healthy.
Actual: Chronic scheduled failure for days to weeks, escalated to the chairman as a liveness decision.`;

const correctedScope = `Close all 3 currently-failing security-linter-sentinel.yml --strict checks
(rls_disabled_in_public: 12 tables, sensitive_columns_exposed: 1, function_search_path_mutable: 2 --
corrected from an originally-scoped 1 after VALIDATION sub-agent review found a second, more recent
offender) by staging correctly-scoped RLS-enable migrations (with real policies where a live
consumer exists, bare enable+revoke where none exists) for every flagged table and pinning
search_path on both flagged SECURITY DEFINER functions, reusing/correcting existing staged
migrations from prior SDs where they already exist rather than duplicating. All DDL remains staged,
@approved-by blank, chairman-applied only -- no migration is applied to prod by the worker.`;

const correctedSuccessCriteria = [
  {
    criterion: 'All 3 failing security-linter-sentinel.yml --strict checks resolve to 0 findings once the staged migrations are applied via the chairman ceremony',
    measure: 'node scripts/sentinels/audit-security-linter.mjs --strict run against a post-apply DB shows rls_disabled_in_public=0, sensitive_columns_exposed=0, function_search_path_mutable=0 -- verified via the migrations\' own DO $verify$ blocks plus a direct re-run of the sentinel'
  },
  {
    criterion: 'north_star and scope_completion_chain get correctly-scoped RLS (a real read policy, not a bare no-policy enable) so no live consumer silently breaks -- north_star (useNorthStar.ts) scoped to status=\'chairman_ratified\'; scope_completion_chain (writer_consumer_asymmetry_witnesses view) via the existing 20260616 permissive read policy',
    measure: 'PR body cites the specific consumer evidence for each; migration files\' self-verification blocks assert the policy exists'
  },
  {
    criterion: 'The pre-existing regression in database/chairman-gated/20260831_rls_lockdown_triage_three_failing_001.sql (blindly including north_star + scope_completion_chain in a no-policy blanket enable+revoke) is corrected in place before it can reach the chairman ceremony',
    measure: 'Diff on that file in the PR shows both tables removed from its ALTER/REVOKE statements, with a header explaining why and pointing at the replacement file'
  },
  {
    criterion: 'No worker-side apply of any RLS/policy/grant migration to prod; all staged with @approved-by left blank',
    measure: 'apply-migration ledger shows no worker-run apply for any of the touched files; PR labels/handoff note the staged set'
  },
  {
    criterion: 'No exempted-tables.json changes -- every flagged table gets a real RLS fix instead of a permanent app-level exemption',
    measure: 'git diff on scripts/sentinels/exempted-tables.json in the PR is empty'
  }
];

const correctedKeyChanges = [
  { change: 'Corrected database/chairman-gated/20260831_rls_lockdown_triage_three_failing_001.sql in place: removed north_star and scope_completion_chain from its blanket no-policy RLS-enable+revoke (regression vs the earlier, evidence-verified 20260825 migration\'s explicit exclusion of both)', impact: 'Prevents a chairman ceremony apply from silently breaking a live north_star browser consumer and the scope_completion_chain UNION branch of writer_consumer_asymmetry_witnesses' },
  { change: 'Authored database/chairman-gated/20260902_security_linter_sentinel_north_star_and_chain.sql: RLS-enable + scoped read policy + write-grant revoke for north_star; companion write-grant revoke for scope_completion_chain (pairs with the already-staged 20260616 RLS-enable+policy for that table)', impact: 'Closes the 2 tables that needed real policies, not bare exemptions' },
  { change: 'Verified via direct pg_catalog/information_schema queries (not assumed) that 20260825, 20260616, and 20260802 migrations remain unapplied on prod, and that v_id/v_hc_flag_enabled/v_s22_flag_enabled have zero code consumers in either repo', impact: 'Confirms the staged fixes are still live-accurate and closes the sentinel\'s findings without duplicate authoring' }
];

async function main() {
  const client = await createDatabaseClient('engineer', {
    connectionString: process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL,
  });

  const existing = await client.query(
    `SELECT metadata FROM strategic_directives_v2 WHERE sd_key = $1`,
    [SD_KEY]
  );
  const metadata = existing.rows[0].metadata || {};
  metadata.mechanism_verifications = [
    {
      verified_by: 'Hotel (direct pg_catalog query) + Explore sub-agent',
      verified_at: 'database/chairman-gated/20260825_enable_rls_chronic_red_guard_zero_consumer_tables.sql:44',
      claim: 'north_star has a real live anon-key browser consumer (excluded here for that reason)',
    },
    {
      verified_by: 'Hotel (direct pg_catalog query) + Explore sub-agent',
      verified_at: 'database/migrations/20260616_security_hygiene_rls_searchpath.sql:46',
      claim: 'scope_completion_chain RLS-enable + read policy already staged here, unapplied',
    },
    {
      verified_by: 'Hotel, direct file read + diff, corrected in place',
      verified_at: 'database/chairman-gated/20260831_rls_lockdown_triage_three_failing_001.sql:36',
      claim: 'file originally regressed against 20260825\'s exclusions for north_star + scope_completion_chain; correction note now present at this line',
    },
    {
      verified_by: 'validation-agent (Task tool, LEAD, sub_agent_execution_results 0289f121-2502-45e5-bb21-09e73badfa1b)',
      verified_at: 'scripts/sentinels/audit-security-linter.mjs:105',
      claim: 'sensitive_columns_exposed shares the rls_disabled_in_public predicate (session_id subset); live --strict --json run confirmed rls_disabled_in_public=12, sensitive_columns_exposed=1, function_search_path_mutable=2',
    },
    {
      verified_by: 'validation-agent (Task tool, LEAD, sub_agent_execution_results 0289f121-2502-45e5-bb21-09e73badfa1b)',
      verified_at: 'database/chairman-gated/20260902_security_linter_sentinel_north_star_and_chain.sql:105',
      claim: 'set_session_awaiting_approval search_path pin present, targets the correct (text, boolean) signature, confirmed live it had no prior pin (not a no-op)',
    },
    {
      verified_by: 'Explore sub-agent (sub_agent_execution_results 62fcd63c-5a92-4443-8c80-b7e90687e899)',
      verified_at: 'database/chairman-gated/20260831_rls_lockdown_triage_three_failing_001.sql:73',
      claim: '9 of the 10 ENABLE ROW LEVEL SECURITY statements here duplicate the 9 already in 20260825 (non-breaking, idempotent, now documented as superseded on that file)',
    },
  ];

  await client.query(
    `UPDATE strategic_directives_v2
     SET description = $1, scope = $2, success_criteria = $3, key_changes = $4, metadata = $5
     WHERE sd_key = $6`,
    [correctedDescription, correctedScope, JSON.stringify(correctedSuccessCriteria), JSON.stringify(correctedKeyChanges), JSON.stringify(metadata), SD_KEY]
  );

  console.log('SD fields corrected for', SD_KEY);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
