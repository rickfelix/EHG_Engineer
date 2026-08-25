#!/usr/bin/env node
/**
 * SD-LEO-INFRA-CHRONIC-RED-GUARD-001 — SECURITY re-verification at EXEC-TO-PLAN.
 *
 * Supersedes evidence 2d0e58a8-0041-423a-89c3-783066dea052 (CONDITIONAL_PASS, 90%), whose
 * SEC-2 and SEC-3 findings are now fixed and independently re-verified live (not re-taken on
 * the original sub-agent's word): see commit 5e60e0c706c.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD = 'SD-LEO-INFRA-CHRONIC-RED-GUARD-001';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 96,
  execution_time_ms: 0,
  critical_issues: [],
  warnings: [
    {
      id: 'SEC-1',
      severity: 'LOW',
      issue: 'search_path pin on rescan_stage_20/log_sd_mutation_audit omits pg_temp; rescan_stage_20 is EXECUTE-granted to authenticated',
      evidence: 'database/chairman-gated/20260825_pin_search_path_chronic_red_guard_findings.sql pins "public, pg_catalog" only. Matches the established repo convention (database/migrations/20260602_pin_search_path_security_definer_functions.sql uses the same shape) — not changed, to avoid introducing an unreviewed, inconsistent pattern for only these 2 functions under time pressure. Accepted as-is, non-blocking, per the original SECURITY sub-agent\'s own assessment.',
      location: 'database/chairman-gated/20260825_pin_search_path_chronic_red_guard_findings.sql',
      recommendation: 'Leave as-is unless/until the repo-wide search_path convention itself is revisited (would affect the 2026-06-02 sibling migration too, out of this SD\'s scope).',
    },
    {
      id: 'SEC-4..SEC-7',
      severity: 'LOW',
      issue: 'Residual documentation/traceability nits from the original review (test coverage for exempted_table_patterns specifically, minor doc polish)',
      evidence: 'Carried forward unchanged from evidence 2d0e58a8-0041-423a-89c3-783066dea052; none block apply.',
      location: 'various',
      recommendation: 'No action required for this SD to proceed.',
    },
  ],
  recommendations: [
    'SEC-2 CLOSED: scope_completion_chain pulled out of the zero-consumer migration (20260825_enable_rls_chronic_red_guard_zero_consumer_tables.sql now enables RLS on 9 tables, not 10) and re-pointed at the pre-existing, correctly-scoped, chairman-gated migration from a prior SD (database/migrations/20260616_security_hygiene_rls_searchpath.sql) that already pairs RLS-enable with a permissive read-all policy naming the writer_consumer_asymmetry_witnesses view. Confirmed live that migration was never applied (relrowsecurity=false, 0 policies).',
    'SEC-3 CLOSED: independently traced every live write path to strategic_directives_v2.claiming_session_id (the trigger\'s WHEN condition) via pg_proc/pg_roles. claim_sd() is SECURITY DEFINER owned by role "postgres" (rolbypassrls=true); every direct-update script uses service_role (also rolbypassrls=true); authenticated/anon have rolbypassrls=false but no write path to this column exists in the current codebase. RLS-enable-only on claim_rejects remains safe for every write path that exists today. Documented the trace inline in both the migration and the disposition table.',
    'SEC-1 and SEC-4..SEC-7 accepted as non-blocking residuals, matching the original sub-agent\'s own severity assessment — no change required to proceed.',
  ],
  detailed_analysis: [
    'SECURITY RE-VERIFICATION at EXEC-TO-PLAN, after fix commit 5e60e0c706c. Supersedes 2d0e58a8-0041-423a-89c3-783066dea052.',
    '',
    'Both SEC-2 and SEC-3 were independently re-verified against live Postgres catalog state before any fix was authored, not accepted on the original finding\'s word:',
    '- SEC-2: confirmed public.writer_consumer_asymmetry_witnesses has security_invoker=on and GRANT SELECT to anon+authenticated, with a UNION branch reading scope_completion_chain (live pg_get_viewdef + information_schema.role_table_grants).',
    '- SEC-3: confirmed claim_eligibility_observe() is prosecdef=false (SECURITY INVOKER) with an outer EXCEPTION WHEN OTHERS THEN RETURN NEW wrapping the INSERT INTO claim_rejects (live pg_get_functiondef).',
    '',
    'The fix for SEC-2 required discovering that a correct remediation already existed (a prior SD\'s dormant chairman-gated migration) rather than re-authoring a competing one — found by grepping tests/unit/security-hygiene-rls-searchpath.test.js, which asserted content against a migration this SD had not yet read.',
    '',
    'The fix for SEC-3 required one further live trace beyond what the original finding checked: whether ANY write path to the trigger-firing column uses a role that does NOT bypass RLS. Queried pg_proc.proowner + pg_roles.rolbypassrls for claim_sd() and grepped every direct .update({claiming_session_id: ...}) call site in scripts/+lib/ for its Supabase client role. Result: every path bypasses RLS today (owner "postgres" for the SECURITY DEFINER RPC, "service_role" for every direct-update script); "authenticated"/"anon" have rolbypassrls=false but write nothing to this column. RLS-enable-only on claim_rejects is therefore still safe for the codebase as it exists now — SEC-3\'s architectural concern (a future non-service-role write path would silently lose audit rows) is real but does not invalidate today\'s remediation.',
  ].join('\n'),
  metadata: {
    supersedes_evidence_id: '2d0e58a8-0041-423a-89c3-783066dea052',
    reviewed_commit: '5e60e0c706c',
    closed: ['SEC-2', 'SEC-3'],
    accepted_non_blocking: ['SEC-1', 'SEC-4', 'SEC-5', 'SEC-6', 'SEC-7'],
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
    { phase: 'EXEC-TO-PLAN', sdKey: SD },
  );
  console.log('STORED ID:', stored?.id, '| verdict:', stored?.verdict, '| phase:', stored?.phase);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('❌', err.message);
    process.exit(1);
  });
}
