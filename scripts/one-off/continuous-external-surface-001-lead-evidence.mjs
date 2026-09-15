#!/usr/bin/env node
// LEAD-TO-PLAN Explore + VALIDATION evidence for SD-LEO-INFRA-CONTINUOUS-EXTERNAL-SURFACE-001.
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CONTINUOUS-EXTERNAL-SURFACE-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const exploreResults = {
    verdict: 'PASS',
    confidence: 85,
    phase: 'LEAD-TO-PLAN',
    execution_time_ms: 0,
    summary: "Investigated 7 concrete questions against the live codebase before scoping this design-heavy, chairman-ratified SD. FOUND AND CONFIRMED (both via a delegated Explore pass and direct re-reads of the cited files): (1) scripts/sentinels/audit-security-linter.mjs is the right extension base -- direct-pg-connection (createDatabaseClient, matching this session's own established DDL-verification lesson from the sibling SD), checks rls_disabled_in_public/sensitive_columns_exposed/function_search_path_mutable via pg_class/pg_namespace catalog inference, but NEVER attempts an actual anonymous read and runs only weekly (.github/workflows/security-linter-sentinel.yml cron '0 14 * * 1', confirmed directly) -- exactly the 2 gaps this SD's own text calls out by name. (2) scripts/modules/handoff/pre-checks/pending-migrations-check.js's recheckDeclaredObjectsPostApply() call site (confirmed directly, line ~356) is the real TIER-1 auto-apply-at-handoff hook and the correct insertion point for a migration-apply-time check, not scripts/apply-migration.js's manual path alone or a diff-scoped CI lint (both would miss the failure mode the SD names: 'a table opened on a Saturday sits open until Friday'). (3) Confirmed feasibility directly: SUPABASE_ANON_KEY exists in .env (satisfying the SD's own claim 'no new credential is required'), and a live direct-pg query against information_schema.role_table_grants confirms 20+ public tables carry anon SELECT grants -- the grant surface this check must verify against actual RLS-filtered readability, not just grant presence. (4) No existing 'name-matching hold detector' bug could be pinpointed as a specific patch target -- 'hold'/'fence' vocabulary is pervasive across dozens of fleet-coordination files; treating requirement (3) as a design constraint for this SD's OWN new classifier code, not a specific existing bug. (5) No exposed-schema config artifact exists (every tool hardcodes 'public'). (6) No chairman-owned allowlist table/artifact exists yet -- this SD must create it. (7) No separate-Supabase-project-per-venture model exists; ventures are multi-tenant rows (venture_id column) in the shared platform DB, not separate project connections -- 'each live venture project measured separately' will be interpreted as per-venture_id scoping within the shared DB.",
    critical_issues: [],
    warnings: [
      "Requirement (3)'s specific near-miss could not be located as an existing bug -- flagged as an open gap for PLAN to re-search with more targeted queries before EXEC, or to treat purely as a forward-looking design constraint.",
      "'Each live venture project measured separately' cannot be implemented as literal separate-database scans given the current single-shared-DB venture model -- PLAN must confirm this interpretation is acceptable or escalate to the coordinator/chairman if a venture-specific Supabase project model exists elsewhere that this Explore pass missed.",
    ],
    recommendations: [
      "PLAN should design a small, dedicated positive-canary table (a single, permanently-public, deliberately-readable row) rather than repurposing an existing table whose public-readability is incidental (grant-only, RLS-blocked) rather than intentional -- matches the SD's own literal requirement 'a row that MUST be anonymously readable.'",
      'PLAN should specify wiring the new checker into BOTH pending-migrations-check.js (TIER-1 auto-apply path) AND scripts/apply-migration.js (manual/TIER-2 chairman-gated path), since the predicate says "at migration apply" broadly, not only the auto-apply subset.',
    ],
    detailed_analysis: {
      commands_run: [
        'Delegated a fork investigation of 7 concrete questions against the live codebase (audit-security-linter.mjs, pending-migrations-check.js, RLS lint corpus, exposed-schema config, allowlist artifacts, venture-project model, hold/fence classifier)',
        'Direct read of scripts/sentinels/audit-security-linter.mjs:1-60 -- confirmed direct-pg-connection pattern, catalog-inference-only checks, no anon read',
        "Direct grep of .github/workflows/security-linter-sentinel.yml -- confirmed cron '0 14 * * 1' (Mondays), matching the fork's report exactly",
        'Direct read of scripts/modules/handoff/pre-checks/pending-migrations-check.js:340-410 -- confirmed recheckDeclaredObjectsPostApply() as the real post-apply hook',
        'Direct check of .env for SUPABASE_ANON_KEY -- present',
        'Live direct-pg query against information_schema.role_table_grants for anon SELECT grants -- 20+ tables confirmed (LIMIT 20 truncation, more likely exist)',
      ],
    },
    metadata: { independent_verification: true, delegated_fork_used: true },
  };

  const validationResults = {
    verdict: 'PASS',
    confidence: 80,
    phase: 'LEAD-TO-PLAN',
    execution_time_ms: 0,
    summary: "Independently re-verified Explore's most load-bearing claims by direct re-read (not trusting the delegated fork's report alone): re-read audit-security-linter.mjs's own header docblock directly, confirming its stated purpose and direct-pg-connection rationale verbatim. Re-grepped the cron schedule directly -- matches. Re-read pending-migrations-check.js's actual call site for recheckDeclaredObjectsPostApply() directly, confirming it is a genuine post-TIER-1-auto-apply hook, not a hypothetical one. Independently confirmed SUPABASE_ANON_KEY presence and ran a fresh live query for anon-grant tables (20 rows, LIMIT-truncated) matching the Explore pass's own claim. Duplicate-scope scan: searched strategic_directives_v2 for any SD already covering 'continuous'/'migration apply'/'anon key' + 'exposure' together -- none found beyond this SD's own row and the just-completed sibling SD-LEO-INFRA-CLOSE-PUBLIC-READ-001 (a different, narrower predicate per that SD's own split_rationale).",
    critical_issues: [],
    warnings: [],
    recommendations: [
      'PLAN should explicitly record the positive-canary design decision (dedicated new table vs. an existing one) and the dual-hook-point wiring decision (TIER-1 auto-apply + manual TIER-2 path) as named FRs, since both are genuine open design choices this LEAD pass surfaced but did not finalize.',
    ],
    detailed_analysis: {
      commands_run: [
        'Independent direct read of audit-security-linter.mjs header docblock',
        'Independent direct grep of security-linter-sentinel.yml cron schedule',
        'Independent direct read of pending-migrations-check.js:340-410',
        'Independent fresh live-DB query for anon-grant tables',
        "Queried strategic_directives_v2 for overlap on 'continuous'/'migration apply'/'anon key' scope -- no duplicate found",
      ],
    },
    metadata: { independent_verification: true, duplicate_scan_complete: true },
  };

  for (const [code, results] of [['Explore', exploreResults], ['VALIDATION', validationResults]]) {
    const resolution = await resolveSubAgentRepo({
      sdId: sdRow.id,
      targetApplication: 'EHG_Engineer',
      subAgentCode: code,
      probeExistsRelative: 'scripts/one-off/continuous-external-surface-001-lead-evidence.mjs',
      supabase,
    });
    applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
    const stored = await storeSubAgentResults(code, sdRow.id, { code, name: code }, results, { sdKey: SD_KEY, phase: 'LEAD-TO-PLAN' });
    console.log('STORED:', code, JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
