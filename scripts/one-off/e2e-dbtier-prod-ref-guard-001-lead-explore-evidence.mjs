#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-INFRA-E2E-DBTIER-PROD-REF-GUARD-001, LEAD-TO-PLAN phase.
 *
 * Records the discovery work actually performed: locating the existing production-ref
 * predicate, tracing why Playwright has no equivalent gate, identifying the correct
 * injection point given Playwright's per-worker process model, and confirming there is
 * no duplicate/prior-art implementation of this guard anywhere in the repo.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-E2E-DBTIER-PROD-REF-GUARD-001';

const findings = [
  {
    id: 'existing-predicate-located-tests-helpers-db-target',
    severity: 'INFO',
    summary: 'The existing production-ref predicate lives at tests/helpers/db-target.js, NOT under lib/testing/ as the SD scope originally (incorrectly) named it -- corrected during LEAD validation. projectRefOf(url) (line 28) regex-extracts a Supabase project ref from a URL. assessDbTarget(env = process.env) (line 50) is a pure function returning {allowed, reason, ref}: allowed only if ref is in DESIGNATED_NON_PROD_REFS (Object.freeze([]), currently empty -- no non-prod project provisioned yet) OR the caller opts in via VITEST_DB_ALLOW_REF=<ref> matching the resolved ref exactly. Everything else fails closed. tests/helpers/db-available.js re-exports it for describeDb/itDb/HAS_REAL_DB; tests/helpers/db-tier-gate.js\'s installDbTierGate() (line 120) is the vitest-side runtime enforcement, wired via tests/setup.db.js (a vitest setupFiles entry).',
  },
  {
    id: 'no-equivalent-gate-exists-for-playwright',
    severity: 'HIGH',
    summary: 'git grep for the predicate/refusal pattern across tests/e2e, tests/uat and playwright* returns ZERO hits. playwright.config.js has globalTeardown only (no globalSetup) and calls dotenv.config() at module scope (line 6) without validating the resolved SUPABASE_URL at all. 39+ individual tests/e2e/**/*.spec.ts files each independently build their own createClient(process.env.SUPABASE_URL, ...) inside their own test.beforeAll -- e.g. tests/e2e/venture-lifecycle/phase1-the-truth.spec.ts:20-37. The "setup" Playwright project (auth.setup.spec.ts) drives the app through the browser, not a direct Node Supabase client, so it does not intercept those 39+ files\' own client construction. Live root measured: resolved production ref = dedlbzhpgkmetvhbkyzq, VITEST_DB_ALLOW_REF unset.',
  },
  {
    id: 'correct-injection-point-identified-config-module-scope',
    severity: 'INFO',
    summary: 'Playwright workers are separate Node processes that each freshly import the resolved config file before importing any test file in that worker -- so module-top-level code in playwright.config.js (the same place dotenv.config() already runs) executes in every worker BEFORE any spec file (and its createClient call) is loaded. A globalSetup script, by contrast, runs once in a separate one-shot process and cannot propagate an in-memory guard into worker processes -- it can only fail-fast the whole run via throw/process.exit, which does not help if a per-worker in-process patch (like a fetch override) were the intended mechanism. Five playwright*.config.js entry points exist, not one: playwright.config.js, playwright-uat.config.js, playwright-uat-nosetup.config.js, playwright-test.config.js, playwright.diagnostic.config.js -- all five need the guard.',
  },
  {
    id: 'child-process-write-path-rules-out-porting-the-vitest-fetch-net-patch',
    severity: 'HIGH',
    summary: 'tests/e2e/phase-handoffs.spec.ts:21 shells out via child_process to `node scripts/handoff.js` (registered in tests/e2e/quarantine.json:642) -- this is the incident\'s actual writer (tests/e2e/phase-handoffs.spec.ts:44). Both of db-tier-gate.js\'s vitest-side enforcement mechanisms -- the fetch override (line 166-170) and the net/tls socket monkey-patch (line 183-196) -- are strictly in-process and do NOT cross a child_process boundary. Porting installDbTierGate() into a Playwright fixture (rather than the config-module-scope abort) would leave this child-process write path fully live even after the guard "ships." This directly informed the LEAD ruling prohibiting a fetch-patch substitute and mandating a config-module-scope run-abort instead (no test file loads => no child_process ever spawns).',
  },
  {
    id: 'no-shared-prod-ref-constant-exists',
    severity: 'INFO',
    summary: 'No exported PROD_REF (or equivalent) constant exists anywhere in the repo -- searched tests/, scripts/, docs/. The only occurrence is a local test-fixture hardcode at tests/unit/vitest-db-project-gated.test.js:24 (`const PROD_REF = \'dedlbzhpgkmetvhbkyzq\'; // the ref measured as live in the shared .env`). The ref itself is not a credential -- it appears in 30+ tracked files including README.md and .env.example (it is a URL subdomain, not a secret), confirmed independently by validation-agent.',
  },
  {
    id: 'no-duplicate-or-prior-art-anywhere-in-repo',
    severity: 'INFO',
    summary: 'Searched for SD-LEO-FIX-REMEDIATION-E2E-TEST-001 (the SD\'s own dedup_match_sd_key hint) across tests/, scripts/, docs/ and git log (`git log --all --oneline --grep="REMEDIATION-E2E-TEST"`) -- zero references anywhere; not a duplicate (independently confirmed by validation-agent: that SD is cancelled and unrelated, matched on the bare token "E2E-TEST"). Parent SD-LEO-INFRA-E2E-REAL-TEST-001\'s own worktree has zero commits ahead of main (`git log main..HEAD` empty) -- no implementation has started there to dedup against either.',
  },
  {
    id: 'playwright-uat-config-not-fully-audited',
    severity: 'INFO',
    summary: 'playwright-uat.config.js has its own globalSetup (./tests/uat/setup/global-auth.js) and a separate test directory (tests/uat/) -- its Supabase usage pattern was not fully audited in this pass and should be checked during PRD authoring / EXEC to confirm the same module-scope injection approach applies cleanly there too, alongside the other 4 configs.',
  },
];

const warnings = [
  'assessDbTarget fails closed against ANY undesignated ref, not specifically the production ref -- literal reuse alone means the guard blocks all real-target Playwright runs by default today (since DESIGNATED_NON_PROD_REFS is empty), which happens to cover production but is not itself a production-specific check. LEAD ruled (see metadata.lead_validation_rulings on this SD) to add a narrow, additional production-ref denylist check as belt-and-suspenders so the guard also matches the SD\'s literal exit-predicate wording independent of the opt-in escape hatch.',
  'ehg-app-auth-smoke.yml deliberately strips Supabase env for a credential-less UI-only run (a documented prior security fix, comment at :80-83) -- a naive `!allowed` refusal condition would break it, since assessDbTarget also returns allowed:false for the no-SUPABASE_URL case. The call site must compose `ref && !allowed`, not bare `!allowed` (both fields are already returned by assessDbTarget -- no predicate change needed).',
];

const recommendations = [
  'PLAN should author the guard as a single new shared module (e.g. tests/helpers/e2e-db-target-guard.js) that imports assessDbTarget + projectRefOf unchanged, adds the narrow production-ref denylist per the LEAD ruling, and is required at module top-level by all five playwright*.config.js files.',
  'PLAN must explicitly prohibit porting/adapting installDbTierGate()\'s fetch/net monkey-patching into Playwright (does not cross the child_process boundary that tests/e2e/phase-handoffs.spec.ts relies on) and mandate a hard abort (throw / process.exit) at config module scope instead.',
  'PLAN must record in the PRD and PR description that e2e-human-like.yml and stories-ci.yml are EXPECTED to start failing their E2E steps on merge (they currently use real production credentials) -- this is the fix working as intended (binding-on-ship, per the SD\'s own FR-1), not a regression to revert.',
  'PLAN should note the QF-20260705-022 cross-reference (open, unclaimed, different mechanism -- a new RUN_REAL_DB_TESTS opt-in for vitest tests) so EXEC does not assume this SD resolves it, and so a future build of that QF is steered toward reusing assessDbTarget\'s no-new-allow-list philosophy instead of introducing a second gate mechanism.',
];

const summary = 'Explore-phase discovery for SD-LEO-INFRA-E2E-DBTIER-PROD-REF-GUARD-001 located the existing production-ref predicate (tests/helpers/db-target.js\'s assessDbTarget/projectRefOf -- NOT under lib/testing/ as originally scoped), confirmed no equivalent gate exists for Playwright (39+ spec files each independently construct their own Supabase client), identified playwright.config.js module-scope as the correct injection point given Playwright\'s per-worker process re-import model, and surfaced a critical child_process write path (tests/e2e/phase-handoffs.spec.ts shelling out to scripts/handoff.js) that rules out porting the vitest-side fetch/net monkey-patch -- only a full run-abort at config load time covers it. Confirmed no duplicate implementation exists anywhere in the repo. This exploration output was the basis for LEAD\'s scope correction and design rulings (see metadata.lead_validation_rulings on this SD).';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 92,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'tests/helpers/db-target.js',
        'tests/helpers/db-available.js',
        'tests/helpers/db-tier-gate.js',
        'tests/setup.db.js',
        'tests/unit/vitest-db-project-gated.test.js',
        'playwright.config.js',
        'playwright-uat.config.js',
        'playwright-uat-nosetup.config.js',
        'playwright-test.config.js',
        'playwright.diagnostic.config.js',
        'tests/e2e/phase-handoffs.spec.ts',
        'tests/e2e/quarantine.json',
        'tests/e2e/venture-lifecycle/phase1-the-truth.spec.ts',
        'tests/e2e/ehg-app/auth.setup.spec.ts',
      ],
      searches_run: [
        'git grep for production-ref refusal pattern across tests/e2e, tests/uat, playwright*',
        'git log --all --oneline --grep="REMEDIATION-E2E-TEST"',
        'search for a shared PROD_REF constant across tests/, scripts/, docs/',
      ],
      dedup_candidates_checked: ['SD-LEO-FIX-REMEDIATION-E2E-TEST-001', 'SD-LEO-INFRA-E2E-REAL-TEST-001 (parent)'],
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'Explore',
    SD_KEY,
    { name: 'Explore' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' },
  );

  console.log('EXPLORE EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
