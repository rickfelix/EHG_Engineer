#!/usr/bin/env node
/**
 * Explore sub-agent evidence writer — SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E, LEAD_TO_PLAN gate.
 *
 * Independent due-diligence pass over the dual-write implementation in the isolated altifyai
 * worktree (C:\Users\rickf\Projects\_EHG\altifyai\.worktrees\SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E,
 * branch feat/SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E): read lib/events/track.js,
 * src/routes/events.js, tests/events-forward.test.js, tests/events-route.test.js,
 * .github/workflows/deploy.yml, docs/stripe-secret-provisioning.md, wrangler.toml; grepped the
 * whole altifyai tree for recordUsageEvent/listUsageEventsForUser callers; ran the full vitest
 * suite (492 passed, 1 pre-existing unrelated failure confirmed present on origin/main via
 * `git show origin/main:tests/contamination-scan.test.js`).
 */
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E';

const FINDINGS = [
  'CONFIRMED FAIL-SOFT — `git diff origin/main -- lib/events/track.js src/routes/events.js` in '
    + 'the altifyai worktree shows a pure addition: forwardUsageEventToSupabase is new code, and '
    + 'the only change to recordEventHandler (src/routes/events.js) is a try/catch inserted AFTER '
    + 'the D1 recordUsageEvent call and BEFORE the jsonResponse return -- a thrown/rejected forward '
    + 'can never reach the response. listEventsHandler/listUsageEventsForUser (the GET /api/events '
    + '-> UsageDashboard.jsx read path) are byte-for-byte untouched.',
  'CONFIRMED NO OTHER CALLERS — grepped the whole altifyai tree for recordUsageEvent| '
    + 'listUsageEventsForUser: the only production call site is src/routes/events.js.',
  'CONFIRMED — .github/workflows/deploy.yml runs on push to main with authenticated '
    + 'CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID, running wrangler d1 migrations apply + wrangler '
    + 'deploy. This directly falsifies the SD\'s original premise that "wrangler is unauthenticated '
    + '... no deploy/wrangler step exists" (now corrected in the SD\'s own description).',
  'CONFIRMED — docs/stripe-secret-provisioning.md independently documents the identical '
    + '"wrangler is unauthenticated locally, but CI\'s deploy.yml is real and authenticated" '
    + 'correction, with the same Option A/B structure the new runbook '
    + '(docs/usage-event-ingest-secret-provisioning.md) mirrors.',
  'CONFIRMED DORMANCY — VENTURE_ID/EHG_ENGINEER_INGEST_SECRET do not appear in wrangler.toml, and '
    + 'lib/error-capture/capture.js / lib/feedback/submit.js (sibling already-shipped features) both '
    + 'read the same env keys and are equally dormant today -- this SD\'s dual-write joining them in '
    + 'that state is the established pattern, not a novel gap.',
  'REAL DEFECT FOUND AND FIXED DURING THIS REVIEW — Child A\'s own live SD scope text '
    + '(SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A) states the shared venture_usage_events event_type '
    + 'enum is (page_view, custom_event), explicitly warning "\'custom_event\' not '
    + '\'conversion_event\'" -- but AltifyAI\'s own local vocabulary is (page_view, '
    + 'conversion_event), and the initial implementation forwarded eventType verbatim. Left '
    + 'unfixed, every non-page_view event (i.e. most real conversion signal) would have permanently '
    + 'failed the RPC\'s CHECK constraint once live -- fail-soft on the HTTP response, but silently '
    + 'defeating the entire purpose of the dual-write for the traffic that matters most. Fixed with '
    + 'an explicit RPC_EVENT_TYPE translation map in lib/events/track.js, tested in '
    + 'tests/events-forward.test.js (translation-specific test added), and documented as a '
    + 're-verify-once-Child-A-ships item since Child A has not shipped a PRD/migration yet.',
  'VERIFIED test suite: 492 passed / 1 failed suite (tests/contamination-scan.test.js, a '
    + 'SyntaxError present identically on origin/main before any of this SD\'s changes -- confirmed '
    + 'via `git show origin/main:tests/contamination-scan.test.js`, byte-identical content).',
  'RISK FLAGGED (non-blocking) — Child A is still in PLAN_PRD with no PRD row yet; its actual '
    + 'migration could still change p_event_type\'s enum, error codes, or param names before it '
    + 'ships. This SD\'s code is committed to today\'s snapshot of Child A\'s SD-level scope text '
    + '(not a finalized PRD/migration) -- recommend a coordination checkpoint re-diffing this '
    + 'against Child A\'s finalized migration SQL before/at Child A\'s own PLAN-TO-EXEC handoff.',
];

const SUMMARY = 'Explore LEAD_TO_PLAN verdict: PASS with one real defect found and fixed in-review. '
  + 'The dual-write is genuinely fail-soft (independently confirmed at the diff level, not just '
  + 'trusted from description), has no other callers to regress, and the SD\'s corrected premise '
  + 'about deploy.yml/wrangler authentication is independently verified true. One real bug -- an '
  + 'event_type vocabulary mismatch that would have silently defeated the dual-write\'s purpose for '
  + 'most real traffic once live -- was found by cross-checking Child A\'s own scope text and fixed '
  + 'with a tested translation map before this evidence was recorded. Zero regressions (492 passing, '
  + '1 pre-existing unrelated failure). One non-blocking risk flagged: Child A\'s contract is not '
  + 'yet finalized (no PRD), so this SD\'s assumed contract should be re-verified once Child A ships.';

async function main() {
  const supabase = await getSupabaseClient();

  const results = {
    verdict: 'PASS',
    confidence: 88,
    summary: SUMMARY,
    findings: FINDINGS,
    warnings: [
      "Child A (the RPC this SD's dual-write targets) has not shipped a PRD or migration yet -- "
        + 'the assumed RPC contract (param names + event_type enum) is taken from Child A\'s SD-level '
        + 'scope text, not a finalized artifact, and must be re-verified once Child A ships.',
    ],
    recommendations: [
      'Re-diff the RPC_EVENT_TYPE translation map and the p_venture_id/p_ingest_secret/p_event_type/'
        + 'p_event_name/p_properties param shape against Child A\'s actual migration SQL once it '
        + 'exists, before/at Child A\'s PLAN-TO-EXEC handoff.',
    ],
    validation_mode: 'prospective',
    metadata: {
      recorded_by: 'scripts/one-off/explore-evidence-need-able-produced-001-e.mjs',
      assessment_type: 'lead_phase_due_diligence',
      investigation_target_repo: 'altifyai (sibling repo, isolated worktree -- see below); repo_path/executed_from_cwd below are stamped against this SD\'s declared target_application (EHG_Engineer) per the SUB_AGENT_REPO_RESOLUTION gate contract, not the investigation target',
      target_branch: 'feat/SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E',
      files_read: [
        'lib/events/track.js',
        'src/routes/events.js',
        'tests/events-forward.test.js',
        'tests/events-route.test.js',
        '.github/workflows/deploy.yml',
        'docs/stripe-secret-provisioning.md',
        'wrangler.toml',
      ],
      real_defect_found_and_fixed: 'event_type vocabulary mismatch (conversion_event vs custom_event) -- see findings',
      test_suite_result: '492 passed, 1 pre-existing unrelated failure (tests/contamination-scan.test.js)',
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'EXPLORE',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults('EXPLORE', SD_KEY, null, results, {
    phase: 'LEAD_TO_PLAN',
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

  console.log('\nEXPLORE evidence recorded and read back:');
  console.log(JSON.stringify(data, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
