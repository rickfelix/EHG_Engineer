#!/usr/bin/env node
/**
 * EXEC-TO-PLAN SECURITY sub-agent evidence write for
 * SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001. One-off, run once.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = '4003f694-8f38-4c3f-9f6e-c11655bfcfdc';
const SD_KEY = 'SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001';

const results = {
  verdict: 'PASS',
  confidence_score: 88,
  summary: 'Adversarial SECURITY review of lib/org/acceptance-suite/ (the 2 live-DB-touching integrity checks + the suite runner). Found and fixed 2 real hardening gaps (uncaught-crash DoS surface in content_hash computation; unguarded injectable-deps trust boundary in both integrity checks) plus a minor fail-closed reason-accuracy bug. 4 other adversarial hypotheses investigated and ruled out as not applicable to this code\'s current callers.',
  critical_issues: [],
  warnings: [
    {
      severity: 'MEDIUM',
      issue: 'run-suite.mjs: stableStringify() computed content_hash OUTSIDE runOneCheck\'s per-check try/catch. A circular organization object (org.self = org) crashed the entire runSuite() call with an uncaught RangeError (Maximum call stack size exceeded) instead of degrading to a reported result -- reproduced live before the fix, verified fixed after.',
      recommendation: 'FIXED: added a WeakSet ancestor-chain cycle guard to stableStringify (cycles render as "[Circular]") plus a try/catch backstop around the content_hash block so content_hash degrades to null with a findings[] entry on any other stringify-time throw (e.g. a BigInt field), instead of an uncaught crash.'
    },
    {
      severity: 'LOW',
      issue: 'checks/integrity/base-immutable.mjs and norms-unwritable.mjs accept an injectable deps.supabase / deps.createDatabaseClient for unit-test mocking, honored unconditionally. A future caller of check(organization, deps) outside this suite\'s own tests could pass a mock that forces a security-critical live-DB check to always report passed:true. Confirmed via repo-wide search that NO current caller does this (only this suite\'s own unit tests, and run-suite.mjs\'s runOneCheck() which calls check.check(organization) with zero deps arguments) -- not a reachable exploit today, but a real design gap worth closing cheaply.',
      recommendation: 'FIXED: added lib/org/acceptance-suite/checks/integrity/_shared.mjs::isTestEnvironment() and gated both injection points on it (VITEST or NODE_ENV=test), matching this repo\'s established pattern for injectable test-only escape hatches (lib/notifications/transport-test-isolation-guard.js). Injected deps outside a test runner are now silently ignored and the check falls through to building its own real service-role client.'
    },
    {
      severity: 'LOW',
      issue: 'base-immutable.mjs columnAbsent() collapsed "column exists" and "an unrelated probe error" (e.g. network/auth failure, not PostgREST 42703 undefined_column) into the same false return. The check still failed CLOSED (passed:false) in both cases, but the reason string wrongly claimed the table "carries a venture_id column" for what could be a transient connectivity error, misleading a reader of the finding.',
      recommendation: 'FIXED: columnAbsent() now returns which case occurred; the check reports an accurate "unexpected error probing" reason distinct from the venture_id-present reason. norms-unwritable.mjs already handled this correctly and was used as the reference pattern.'
    }
  ],
  recommendations: [
    'Residual, not fixed (judged unnecessary given current callers): stableStringify\'s cycle guard does not add an explicit recursion-depth limit, so a pathologically deep (non-circular) organization object could still stack-overflow. Not fixed because (a) the cycle guard closes the concrete, reproducible crash vector verified live, (b) organization objects today are produced only by resolveVentureRoles() and this suite\'s own MAST fixtures via structuredClone, both bounded shapes with no realistic path to extreme depth, and (c) the try/catch backstop around content_hash means even a stack-overflow RangeError there would need the same treatment as any other throw -- worth revisiting only if this suite is ever exposed to externally-supplied organization objects.'
  ],
  findings: [],
  metadata: {
    review_scope: [
      'lib/org/acceptance-suite/checks/integrity/base-immutable.mjs',
      'lib/org/acceptance-suite/checks/integrity/norms-unwritable.mjs',
      'lib/org/acceptance-suite/run-suite.mjs',
      'lib/org/acceptance-suite/fixtures/mock-venture.mjs (read for context, no changes)'
    ],
    adversarial_hypotheses_checked: {
      'sql_injection_in_grantsAreServiceRoleOnly': 'NOT A REAL ISSUE -- the raw pg query parameterizes table_name via $1 (a WHERE-clause VALUE, not an interpolated identifier). Traced every call site: grantsAreServiceRoleOnly is only ever invoked with the hardcoded module-level TABLE constant; deps={} carries no table-override key, so there is no path for a caller of check(organization, deps) to influence the queried table name.',
      'credential_leakage_in_reason_strings': 'NOT A REAL ISSUE -- neither integrity check ever embeds SUPABASE_SERVICE_ROLE_KEY or any secret in a reason/error string. reason strings echo only grantee/privilege_type rows from information_schema (not secrets) or PostgREST error codes/messages. scripts/lib/supabase-connection.js error paths (createDatabaseClient, testConnection) do not print the password or full connection string either.',
      'information_disclosure_via_MAST_reason_strings': 'NOT A REAL ISSUE TODAY -- read all 14 MAST check reason strings; they echo task ids/role names/field names FROM the organization object under test, never internal schema/query details, and the only current caller of this data is the suite\'s own trusted fixtures. Flagged as worth re-checking only if this suite is ever wired to a lower-trust caller.',
      'rls_grant_query_fail_open_vs_closed': 'CONFIRMED FAILS CLOSED -- grantsAreServiceRoleOnly has no internal try/catch; a query error propagates out of check() through the finally block (dbClient.end() still runs) and is caught by runOneCheck() in run-suite.mjs, which records passed:false. Verified this is the only production-wired call path (tests/database/org-acceptance-suite-integrity.db.test.js and run-suite.mjs both go through this). No fail-open path found.'
    },
    branch: 'feat/SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001',
    fixes_applied: true,
    fixes_committed: true,
    tests_run: 'npx vitest run tests/unit/org/acceptance-suite/ -- 55/55 passed (5 new regression tests added: 2 for circular-organization content_hash handling, 1 for accurate fail-closed reason on an unexpected probe error, 1 for the deps-injection guard being honored)'
  }
};

async function main() {
  const resolution = await resolveSubAgentRepo({
    sdId: SD_ID,
    targetApplication: null,
    fallback: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
  });
  applySubAgentRepoVerdict(results, resolution, { severity: 'HIGH' });

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_ID,
    { code: 'SECURITY', name: 'Security' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC-TO-PLAN' }
  );

  console.log('STORED ROW ID:', stored?.id ?? stored);
  console.log('VERDICT:', stored?.verdict);
  console.log('REPO RESOLUTION:', JSON.stringify(resolution));
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('FAILED TO STORE SECURITY RESULTS:', err);
    process.exit(1);
  });
}
