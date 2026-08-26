#!/usr/bin/env node
/**
 * TESTING sub-agent evidence writer — SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E, PLAN_TO_EXEC gate.
 *
 * An independent, adversarial TESTING review of the already-implemented dual-write (in the
 * isolated altifyai worktree, branch feat/SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E) found 4 real
 * coverage gaps in tests/events-forward.test.js and tests/events-route.test.js: RPC_EVENT_TYPE's
 * fallback path was never exercised, no test asserted on the console.warn failure log's content,
 * no route-level test proved a successful forward is reachable end-to-end through the real
 * worker.fetch composition, and the outer catch in recordEventHandler was flagged as untested
 * (structurally sound but unreachable given forwardUsageEventToSupabase's own internal try/catch --
 * left as a documented, accepted defensive branch, not fixed, since forcing it would require
 * mocking the imported function itself). All fixable gaps closed in commit 29e259a; full suite
 * re-run: 495 passed, 1 pre-existing unrelated failure (tests/contamination-scan.test.js).
 */
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E';

const FINDINGS = [
  'CONFIRMED ordering/fail-soft — recordUsageEvent (D1 write) is awaited and completes before '
    + 'forwardUsageEventToSupabase is even invoked; this is enforced by sequential await, not just '
    + 'a comment, so no race between the D1 write and the forward call is possible.',
  'CONFIRMED every internal failure mode of forwardUsageEventToSupabase (fetch throw, non-JSON '
    + 'body, missing env bindings) is caught inside the function itself, so it never actually '
    + 'throws to its caller.',
  'GAP FOUND AND FIXED — RPC_EVENT_TYPE\'s fallback (`.get(x) ?? x`) was never exercised; every '
    + "prior test used only mapped values ('page_view'/'conversion_event'). Added a dedicated test "
    + "asserting an unmapped eventType ('some_future_type') passes through unchanged, matching the "
    + "map's own documented fallback contract.",
  'GAP FOUND AND FIXED — no test asserted on the console.warn failure log\'s content in TS-8b; a '
    + 'regression of that log shape would have gone uncaught. Added a spy assertion on the exact '
    + 'call arguments.',
  'GAP FOUND AND FIXED — TS-8/TS-8b only ever exercised the not-configured and forward-fails '
    + 'branches through the real composed route; nothing proved a SUCCESSFUL, fully-configured '
    + 'forward is actually reachable end-to-end via worker.fetch (only the isolated unit test '
    + 'covered the success path). Added TS-8c: a fully-configured, fetch-resolves-ok test through '
    + 'the real route, also confirming the event_type translation survives the full composition.',
  'GAP IDENTIFIED, NOT FIXED (documented, accepted) — the outer catch(forwardErr) in '
    + 'recordEventHandler (src/routes/events.js) is structurally sound but has zero test coverage '
    + 'and is effectively unreachable given forwardUsageEventToSupabase\'s own complete internal '
    + 'try/catch. Forcing it would require mocking the imported function itself (not a realistic '
    + 'production failure mode) -- left as a defensive branch, not a gap requiring a contrived test.',
  'VERIFIED full test suite after fixes: 495 passed, 1 pre-existing unrelated failure '
    + '(tests/contamination-scan.test.js, confirmed present on origin/main before this SD).',
];

const SUMMARY = 'TESTING PLAN_TO_EXEC verdict: CONDITIONAL_PASS -> gaps fixed -> PASS. An '
  + 'adversarial review of the already-implemented dual-write found the core contract (D1-write-'
  + 'first ordering, fail-soft on every internal failure mode, spoof resistance) genuinely solid, '
  + 'but found 4 real coverage gaps in the test suite -- an unexercised translation-map fallback, '
  + 'an unasserted warning-log shape, and no end-to-end success-path route test. Three of the four '
  + 'were fixable and fixed in commit 29e259a (11 forward tests, 17 route tests, all passing); the '
  + 'fourth (an unreachable defensive catch branch) is documented as accepted rather than forced '
  + 'with a contrived test. Zero regressions: 495 passing, 1 pre-existing unrelated failure.';

async function main() {
  const supabase = await getSupabaseClient();

  const results = {
    verdict: 'PASS',
    confidence: 90,
    summary: SUMMARY,
    findings: FINDINGS,
    warnings: [
      'recordEventHandler\'s outer catch(forwardErr) branch remains untested -- accepted as an '
        + 'unreachable-in-practice defensive guard given forwardUsageEventToSupabase\'s own complete '
        + 'internal error handling, not a real coverage risk.',
    ],
    recommendations: [
      'If Child A\'s real RPC schema introduces a THIRD event_type value once it ships, add it to '
        + 'RPC_EVENT_TYPE explicitly rather than relying on the untranslated fallback silently '
        + 'passing it through.',
    ],
    validation_mode: 'retrospective',
    metadata: {
      recorded_by: 'scripts/one-off/testing-evidence-need-able-produced-001-e-plan-to-exec.mjs',
      assessment_type: 'plan_to_exec_adversarial_testing_review',
      investigation_target_repo: 'altifyai (sibling repo, isolated worktree)',
      target_branch: 'feat/SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E',
      fixes_applied_commit: '29e259a',
      files_read: [
        'lib/events/track.js',
        'src/routes/events.js',
        'tests/events-forward.test.js',
        'tests/events-route.test.js',
      ],
      test_suite_result: '495 passed, 1 pre-existing unrelated failure (tests/contamination-scan.test.js)',
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults('TESTING', SD_KEY, null, results, {
    phase: 'PLAN_TO_EXEC',
  });

  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .select('id,sub_agent_code,phase,verdict,confidence,validation_mode,created_at')
    .eq('id', stored.id)
    .maybeSingle();

  if (error || !data) {
    console.error(`WROTE but could not read back id=${stored?.id}: ${error?.message || 'no row'}`);
    process.exit(1);
  }

  console.log('\nTESTING evidence recorded and read back:');
  console.log(JSON.stringify(data, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
