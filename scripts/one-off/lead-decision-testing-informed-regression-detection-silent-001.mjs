// Final LEAD scope decision for SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001, incorporating
// the prospective TESTING sub-agent's findings (evidence 5990427e-005c-44e8-bd40-5ed27fbcf347,
// CONCERNS/CONDITIONAL_PASS 88), each independently re-verified against the live DB before
// being folded into scope. This closes the LEAD investigation; PRD authoring follows.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001';

const { data: existing, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('key_changes, risks, metadata')
  .eq('sd_key', SD_KEY)
  .single();

if (fetchErr) {
  console.error('FETCH_ERROR', fetchErr.message);
  process.exit(1);
}

const key_changes = [
  ...(existing.key_changes || []),
  {
    change: "BLOCKING FINDING (TESTING sub-agent, independently re-verified: anon INSERT into root_cause_reports returns 42501 RLS denial, confirmed live; 0 rows with trigger_source='TEST_FAILURE' exist today, ever): triggerRCA()/triggerRCAOrThrow() (lib/rca-runtime-triggers.js:358-448) call createSupabaseClient() (ANON key). Even with all other fixes, the terminal write would be RLS-denied and silently swallowed by the existing QF-20260726-175 fail-soft wrapper -- the SAME error code (42501) as the incident that motivated that wrapper. This SD would otherwise ship a fix for silent regression detection that is itself silent.",
    impact: 'Without this, none of the other fixes in this SD produce an observable outcome -- the monitor would fire correctly and the lookback would correctly identify a regression, and the write would still vanish.'
  },
  {
    change: "LEAD DECISION: change triggerRCA's underlying client from createSupabaseClient() (anon) to createSupabaseServiceClient() (both already exported from lib/supabase-client.js) -- a single-line change to the shared helper, not a scoped/threaded parameter. Rationale: lib/rca-runtime-triggers.js is server-only code (imported only by lib/rca-monitor-bootstrap.js, invoked from server/index.js at startup; never reachable from browser/client code), so anon-key usage here has no legitimate least-privilege justification -- it reads as an oversight, not a deliberate boundary. root_cause_reports is internal diagnostic data, not user-facing, so service-role write access is the already-established pattern for this class of backend write elsewhere in the codebase.",
    impact: "This DOES touch code shared by all 4 monitors (not just monitorTestFailures), which is a deliberate, evidence-based exception to 'do not touch the other 3 monitors' -- the exception is scoped to ONE shared helper function's client choice, not a rewrite of any other monitor's logic. The other 3 monitors remain non-functional for their OWN, separately-filed reasons (sub_agent_execution_results unpublished; retrospectives replica identity) regardless of this change, so this is not silently expanding delivered scope, only removing one of several independent blockers each has."
  },
  {
    change: 'Identity key confirmed as test_full_title per TESTING\'s direct measurement (both NULL-title rows AND non-test test_file_path values independently confirmed), but test_full_title is NULL on 4/52 (7.7%) existing rows -- add an explicit NULL/empty guard (loud log, no trigger attempt) rather than let it silently misclassify as "first-ever failure" or, worse, cross-match unrelated NULL-title rows against each other.',
    impact: 'Closes a reintroduction of the exact silent-failure defect class this SD exists to eliminate, just relocated to a different column.'
  },
  {
    change: 'Lookback query needs a deterministic tiebreaker (ORDER BY test_runs.started_at DESC, test_runs.id DESC) -- confirmed live: two existing test_runs share an identical started_at timestamp. Also must tolerate sparse runs (9 of 14 test_runs have zero test_results rows) and must exclude same-run retries (test_results.retry_count exists; multiple rows can share one test_full_title within a single test_run_id) by requiring an EARLIER test_run_id, not just an earlier row.',
    impact: 'Prevents non-deterministic test flakiness and a same-run-retry false-positive.'
  },
  {
    change: 'Test seam: TESTING confirmed no callable seam exists today for the postgres_changes callback body, and recommended AGAINST extracting one -- in-repo precedent (tests/unit/eva/venture-monitor.test.js) captures the handler directly off the mocked .on() call (mockSupabase._mockChannel.on.mock.calls[0][2]) and invokes it with a fake payload. This proves the wire (channel target, event filter) is correct, not just the extracted logic in isolation. Combine with tests/unit/rca-trigger-failsoft.test.js\'s vi.mock hoisting pattern for the Supabase client.',
    impact: 'Keeps this a bug-fix FR, not a refactor FR, per TESTING\'s explicit reasoning -- an extracted function\'s test could go green while the function is never actually wired into .on(), which is exactly the class of false-confidence this SD exists to eliminate.'
  },
];

const risks = [
  ...(existing.risks || []),
  {
    risk: 'A source-text pin checking for the string "test_failures" would still match after the fix, since the realtime CHANNEL NAME (not just the table option) is also literally "test_failures" (lib/rca-runtime-triggers.js:115) -- a test that cannot fail (PAT-TEST-PINS-FACT-NOT-BEHAVIOUR-001).',
    impact: 'low',
    likelihood: 'medium',
    mitigation: 'Anchor any static pin to the table: option specifically (or the on() call\'s config object via deep-equal against the captured mock args), not a bare string search; TESTING recommended asserting on.mock.calls[0][1] deep-equals the expected {event,schema,table,filter} object as a strictly stronger, unfoolable version of a source-text pin.'
  },
];

const lead_final_scope = {
  at: new Date(2026, 7, 16, 21, 25).toISOString(),
  by: 'LEAD (Golf-5, session 42d805b8-dd3a-443c-9dc9-fb3cb7de3b05)',
  testing_evidence_id: '5990427e-005c-44e8-bd40-5ed27fbcf347',
  independently_reverified_by_lead: [
    'RLS denial: CONFIRMED directly (anon insert into root_cause_reports -> 42501; service-role insert of the same shape accepted and cleaned up).',
    'zero prior TEST_FAILURE rows: CONFIRMED directly (service-role count query, trigger_source=TEST_FAILURE -> 0).'
  ],
  final_scope_boundary: 'monitorTestFailures() logic (table target, lookback query, field mappings) + triggerRCA/triggerRCAOrThrow client (shared, single-line change, evidence-justified exception) + one staged ALTER PUBLICATION migration. Explicitly NOT touching monitorSubAgentFailures/monitorQualityGates/monitorHandoffRejections\'s own subscription logic -- their independent defects are filed separately (feedback ade11984, d9fcf973).',
  prd_next_step: 'Author PRD now via node scripts/add-prd-to-database.js, incorporating all of the above as FRs with the specific test_scenarios TESTING outlined (seam, mocking pitfalls, NULL-title guard, tiebreaker, service-role client, migration idempotency).'
};

const updatePayload = {
  key_changes,
  risks,
  metadata: {
    ...(existing?.metadata || {}),
    lead_decision: {
      ...(existing?.metadata?.lead_decision || {}),
      final_scope: lead_final_scope,
    },
  },
};

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update(updatePayload)
  .eq('sd_key', SD_KEY);

if (updateErr) {
  console.error('UPDATE_ERROR', updateErr.message);
  process.exit(1);
}

console.log('Final TESTING-informed LEAD scope recorded for', SD_KEY);
