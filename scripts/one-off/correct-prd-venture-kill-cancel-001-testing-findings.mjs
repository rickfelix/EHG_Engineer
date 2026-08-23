#!/usr/bin/env node
/**
 * Apply TESTING sub-agent's prospective findings (evidence dbd754fd, phase=PLAN) to the
 * PRD before EXEC writes code. Multiple findings are architecture-level, not test-only:
 *  - F2: kill_venture()'s RPC signature must NOT change (DROP FUNCTION would destroy its
 *    GRANT EXECUTE ACL) -- disposition defaults via COALESCE-style "set only if currently
 *    NULL" logic inside the existing UPDATE, no new parameter.
 *  - F9: use TEXT + CHECK constraint, not a native Postgres ENUM (a sibling migration in
 *    this family already documents the ALTER-TYPE-ordering hazard).
 *  - F1: kill_venture() is gated by fn_is_chairman(), unreachable from a service-role JS
 *    client (auth.uid() is NULL) -- TS-1/2/3 must be DDL-tier SQL tests
 *    (tests/ddl/*.db.test.js pattern), not tests/integration/kill-venture-rpc.test.js.
 *    reject_chairman_decision()'s kill-gate branch has no such gate and CAN be tested there.
 *  - F3: "terminal" must be defined on ventures.status (not workflow_status) -- live-
 *    measured to include TWO zombies today (MarketLens + CronGenius), not one.
 *  - F4: ApexNiche has no deployment_url at all -- "live-but-unregistered" must be defined
 *    on status='active' AND is_demo=false AND unregistered, not deployment-based; AltifyAI
 *    is the genuine deployment-url-based live-and-unregistered specimen.
 *  - F6: applications/registry.json is an object keyed by APP id (not an array), 8 of 10
 *    entries are test/fixture entries needing their own noise filter.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-SD-LEO-INFRA-VENTURE-KILL-CANCEL-001';

const { data: current, error: fetchErr } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, technical_requirements, test_scenarios, acceptance_criteria, risks, system_architecture, implementation_approach')
  .eq('id', PRD_ID)
  .single();
if (fetchErr) { console.error(fetchErr); process.exit(1); }

const functional_requirements = current.functional_requirements.map((fr) => {
  if (fr.id === 'FR-1') {
    return {
      ...fr,
      title: 'Explicit teardown_disposition on terminal-status ventures with a deployment_url (no RPC signature change)',
      description: "CORRECTED (TESTING F2/F9): add ventures.teardown_disposition as TEXT + CHECK (teardown_disposition IN ('pending_teardown','retained','torn_down')) -- NOT a native enum (a sibling migration in this family already hit the ALTER-TYPE-ordering hazard). Add teardown_disposition_reason (text), teardown_disposition_by (text), teardown_disposition_at (timestamptz). Wire kill_venture() and reject_chairman_decision()'s kill-gate branch (database/migrations/20260505224113_ventures_kill_log_and_rpc.sql) with NO new parameter -- CREATE OR REPLACE cannot add a parameter without DROP FUNCTION first, which would destroy the existing GRANT EXECUTE ACL at line 141. Instead, the existing UPDATE statement gains: `teardown_disposition = COALESCE(teardown_disposition, CASE WHEN deployment_url IS NOT NULL THEN 'pending_teardown' END)` -- only sets the value when it is currently NULL, so a disposition set by an earlier, separate chairman action (e.g. a pre-emptive 'retained' set before the kill) is preserved, not overwritten. 'Terminal status' is defined on ventures.status (not workflow_status) -- live-verified: workflow_status-based definitions miss one of the two MarketLens specimen rows.",
      acceptance_criteria: [
        "A venture killed via kill_venture() with a non-null deployment_url and teardown_disposition previously NULL ends up with teardown_disposition='pending_teardown'",
        "A venture with teardown_disposition already set to 'retained' (by an earlier action) before being killed keeps 'retained', not overwritten to pending_teardown",
        "A venture with deployment_url=NULL is unaffected (teardown_disposition stays NULL)",
        "kill_venture()'s function signature is unchanged (no new parameter, no DROP FUNCTION, existing GRANT EXECUTE ACL intact)"
      ]
    };
  }
  if (fr.id === 'FR-2') {
    return {
      ...fr,
      description: fr.description + " CORRECTED (TESTING F3): 'terminal' is defined on ventures.status (cancelled/killed), not workflow_status -- live-measured today to include TWO zombies (MarketLens id=ecbba50e AND CronGenius id=6e23ad2b), not the single MarketLens specimen originally assumed. The report must not hardcode an expectation of exactly one row.",
      acceptance_criteria: [
        ...fr.acceptance_criteria.filter(ac => !ac.includes('does not falsely include')),
        "The report includes ALL live-verified zombies at run time (both MarketLens and CronGenius as of 2026-08-23), not a hardcoded single-row expectation"
      ]
    };
  }
  if (fr.id === 'FR-4') {
    return {
      ...fr,
      description: fr.description.replace(
        "an active, non-demo venture with no matching registry entry (live-but-unregistered, specimen: ApexNiche AI, id=809ec7e7)",
        "an active, non-demo venture with no matching registry entry (live-but-unregistered) -- CORRECTED (TESTING F4): this check is defined on venture status/is_demo, NOT deployment_url, since the chairman-cited specimen ApexNiche AI (id=809ec7e7) has deployment_url=NULL -- a deployment-based detector could never surface it. AltifyAI (id=50763b6a) is the genuine deployment-url-based live-and-unregistered specimen and is reported separately where deployment_url is the join key."
      ) + " CORRECTED (TESTING F6): applications/registry.json's .applications is an OBJECT keyed by APP id (Object.values(), not .forEach() on the top level, or it throws), and 8 of its 10 entries are test/fixture registrations (test-leo-project, test-venture, test-cicd, four e2e-verdict-engine-178* entries) -- the registry side needs its own noise filter (exclude fixture-named entries) mirroring is_demo=false on the ventures side, or divergence output is ~80% noise.",
      acceptance_criteria: [
        "Report surfaces the MarketLens duplicate-name pair with both IDs and statuses, is_demo=false only",
        "Report surfaces APP006 (registry) as dead-but-registered (venture_id points at a terminal-status venture)",
        "Report surfaces ApexNiche AI as live-but-unregistered via a status/is_demo-based check (not deployment_url-based)",
        "Report surfaces AltifyAI as a separate, deployment-url-based live-and-unregistered specimen",
        "No is_demo=true venture and no test/fixture-named registry entry appears anywhere in the FR-4 output"
      ]
    };
  }
  return fr;
});

const technical_requirements = [...current.technical_requirements];
const tr1 = technical_requirements.find((t) => t.id === 'TR-1');
if (tr1) {
  tr1.description = tr1.description.replace(
    '4 new nullable columns on ventures (teardown_disposition enum + 3 supporting columns)',
    "4 new nullable columns on ventures (teardown_disposition TEXT + CHECK constraint -- CORRECTED from enum per TESTING F9, avoiding this migration family's documented ALTER-TYPE-ordering hazard -- + 3 supporting columns)"
  );
}
technical_requirements.push({
  id: 'TR-5',
  title: 'kill_venture() is auth-gated; test tier must match reachability (TESTING F1)',
  description: "kill_venture() is gated by fn_is_chairman() (database/migrations/20260716_b_fn_is_chairman_read_app_metadata.sql), which resolves auth.uid() -- NULL for a service-role client, so it raises 42501 before reaching the disposition-default logic. tests/integration/kill-venture-rpc.test.js already documents this with it.skip on its own kill_venture()-touching cases. FR-1's disposition-default logic for kill_venture() must be tested at the DDL tier (tests/ddl/*.db.test.js, vanilla ephemeral PG16 via vitest.ddl.config.mjs) with a stubbed fn_is_chairman() returning true, NOT as a service-role integration test. reject_chairman_decision()'s kill-gate branch has no such auth gate and IS reachable from the existing integration test file -- extend it there, not the DDL tier."
});
technical_requirements.push({
  id: 'TR-6',
  title: 'CI wiring: drive-reports-ddl.yml uses a literal paths list (TESTING F8)',
  description: '.github/workflows/drive-reports-ddl.yml gates on an explicit paths: list (already documented in-repo as having caused silent-skip incidents 4 times). EXEC must add BOTH the new migration file and the new DDL test file to this list in the same PR, or the new coverage reports green without ever running.'
});

const test_scenarios = current.test_scenarios.map((ts) => {
  if (ts.id === 'TS-1' || ts.id === 'TS-2' || ts.id === 'TS-3') {
    return {
      ...ts,
      type: 'ddl',
      expected: ts.expected + " TIER CORRECTED (TESTING F1): SQL-level DDL-tier test (tests/ddl/venture-teardown-disposition-ddl.db.test.js, vanilla ephemeral PG16 per vitest.ddl.config.mjs) with a stubbed fn_is_chairman() returning true -- kill_venture() is unreachable from a service-role JS client (fn_is_chairman() raises 42501 first). This tier proves the disposition-default SQL logic, not authorization (state this explicitly in the test file header, per this tier's established 'what a green run does not mean' discipline)."
    };
  }
  if (ts.id === 'TS-4') {
    return {
      ...ts,
      scenario: ts.scenario + ' -- CORRECTED (TESTING F3/F5): terminal status is defined on ventures.status; live data currently has TWO zombies (MarketLens + CronGenius), so the assertion must check MarketLens is INCLUDED, not that it is the only row.',
      expected: "Report includes MarketLens (id=ecbba50e) among the live zombies; excludes all is_demo=true rows. Since 0 of the 130 is_demo=true ventures have a deployment_url, the is_demo exclusion cannot be proven against live data alone (TESTING F5: it would pass vacuously) -- ALSO add a synthetic fixture test with an is_demo=true + deployment_url row to prove the filter actually excludes it."
    };
  }
  if (ts.id === 'TS-5') {
    return {
      ...ts,
      expected: ts.expected + ' CORRECTED (TESTING F4/F6): ApexNiche AI has no deployment_url -- its detection must go through the status/is_demo-based divergence check, not a deployment_url join. AltifyAI is the separate, genuine deployment-url-based live-and-unregistered specimen. The registry-side join must filter out the 8 test/fixture-named entries (test-leo-project, test-venture, test-cicd, four e2e-verdict-engine-178* entries) or divergence output is ~80% noise on that side.'
    };
  }
  return ts;
});
test_scenarios.push({
  id: 'TS-6',
  scenario: 'venture-ops-actuals-sweep.mjs extension uses the existing DI seam, not the rigid test mock',
  type: 'unit',
  expected: "TESTING F7: the existing makeSupabase() fake in tests/unit/cron/venture-ops-actuals-sweep.test.js only supports select/not/neq/order/range and throws on unrecognized tables/columns -- new FR-2/FR-4 queries would either throw or silently return wrong-shaped rows. Use the script's existing main(argv, deps) dependency-injection seam (deps.detectZombies, deps.detectDivergence) for the new logic instead of extending the shared Supabase fake."
});

const acceptance_criteria = current.acceptance_criteria.map((ac) =>
  ac.includes('4 new nullable columns on ventures (teardown_disposition')
    ? 'ventures gains 4 new nullable columns (teardown_disposition TEXT + CHECK constraint + 3 supporting fields), additive only, no native enum'
    : ac
);

const risks = [...current.risks, {
  risk: "TESTING (F10) flagged PRD.activation_test_id is NULL for a migration+cron-worker SD, which is a likely activation-invariant trigger via Lane 1 (Lane 2 free-text regex deliberately does not fire on bare 'column' mentions). Whether this SD trips that gate depends on how EXEC phrases key_changes.",
  impact: 'low', likelihood: 'medium',
  mitigation: 'Flagged now, before EXEC, rather than discovered at LEAD-FINAL-APPROVAL; EXEC should check the gate explicitly if key_changes wording changes materially from this PRD.'
}, {
  risk: 'npm run test:integration can report a passing exit code having executed zero tests (TESTING F11: --project db has passWithNoTests=true and a self-skip guard).',
  impact: 'low', likelihood: 'medium',
  mitigation: 'EXEC must capture and report the actual executed-test COUNT as evidence for the DDL-tier and integration-tier runs, not just the process exit code.'
}];

const { error: updateErr } = await supabase
  .from('product_requirements_v2')
  .update({ functional_requirements, technical_requirements, test_scenarios, acceptance_criteria, risks })
  .eq('id', PRD_ID);
if (updateErr) { console.error(updateErr); process.exit(1); }
console.log('PRD corrected per TESTING findings (F1-F11)');
