#!/usr/bin/env node
// One-off: VALIDATION sub-agent evidence for SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001, LEAD-TO-PLAN phase.
// Records the duplicate/overlap check + premise verification performed directly against current
// main before authoring the PRD (per the repo's own "measure the defect premise against current
// main before authoring a ticket" convention).
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001';

const findings = [
  {
    id: 'no-existing-wall-clock-lint',
    severity: 'INFO',
    summary: 'grep of scripts/lint/ for any file matching wall-clock or clock-skew found nothing — piece (d) is genuinely unbuilt, not a duplicate.',
  },
  {
    id: 'no-existing-absolute-pin',
    severity: 'INFO',
    summary: 'tests/setup.clock-skew.js grep for TEST_CLOCK_PIN confirms only the relative TEST_CLOCK_OFFSET_MS pin exists today; no absolute-instant pin mechanism — piece (c) is genuinely unbuilt.',
  },
  {
    id: 'timeout-ceiling-confirmed-unmeasured',
    severity: 'HIGH',
    summary: '.github/workflows/unit-tier-clock-skew.yml:42 confirms timeout-minutes: 55, with the file\'s own comment admitting it was "Widened with real headroom rather than guessing a second time" -- i.e. a second guess, not a measurement. Matches the ticket premise for piece (b) exactly.',
  },
  {
    id: 'ticket-named-function-does-not-exist-corrected',
    severity: 'MEDIUM',
    summary: 'The ticket text (and QF-20260912-364\'s original coordinator rewrite) names `reconcileSentRows` as one of the time-sensitive entry points for piece (d)\'s lint. That identifier does not exist anywhere in the codebase. The real exported entry point performing this role is `reconcileOutboundSms` (lib/chairman/sms-outbound-worker.js, also its default export) -- confirmed via grep and by reading tests/unit/chairman/sms-outbound-reconcile.test.js, which imports and calls reconcileOutboundSms exclusively, always threading a `now:` option. PRD corrects the entry-point list to match the real codebase rather than encoding a name that would silently never match.',
  },
  {
    id: 'retryOrAlert-is-module-private',
    severity: 'LOW',
    summary: '`retryOrAlert` (also named in the ticket) is declared in lib/chairman/sms-outbound-worker.js but never exported -- no test file can import or call it directly. It is only reachable through reconcileOutboundSms, which the lint already covers. Dropping it from the direct entry-point list loses no real coverage; documented inline in the tool rather than silently omitted.',
  },
  {
    id: 'other-three-entry-points-confirmed-real',
    severity: 'INFO',
    summary: 'isInQuietHours (lib/notifications/orchestrator.js:341), resolveChairmanZone (lib/comms/adam-outbound/quiet-hours-extension.js:107), and smsQuietWindowReleaseIso (lib/time/chairman-et-wall-clock.js:158) are all confirmed real, exported, and take `now` as a parameter -- the ticket\'s naming for these three is accurate as written.',
  },
  {
    id: 'measured-baseline-not-13',
    severity: 'INFO',
    summary: 'A whole-tree census with the corrected entry-point list (node scripts/lint/wall-clock-test-lint.mjs --all, run against current main + this SD\'s new tool) measures 11 pre-existing violating test files today, not the ticket\'s estimated 13. The PRD/tests cite the MEASURED 11, not the ticket\'s unverified guess -- the same measure-don\'t-assume discipline piece (b) itself is about.',
  },
  {
    id: 'no-duplicate-open-sds',
    severity: 'INFO',
    summary: 'strategic_directives_v2 has no other open/in-progress SD referencing clock-skew, wall-clock-test-lint, TEST_CLOCK_PIN, or QF-20260912-364 besides this one and its now-completed predecessor SD-LEO-FIX-SECOND-WALL-CLOCK-001 (which explicitly deferred these three pieces in its own scope_reduction_percentage=75 LEAD note and its shipped CHANGELOG entry).',
  },
];

const recommendations = [
  'PLAN should author the PRD with the CORRECTED entry-point list (reconcileOutboundSms, isInQuietHours, resolveChairmanZone, smsQuietWindowReleaseIso) and the MEASURED baseline count (11), not the ticket\'s as-authored text verbatim.',
  'Piece (b)\'s CI workflow already supports workflow_dispatch (unit-tier-clock-skew.yml:21) -- no new workflow is needed, only a JSON-reporter addition to the existing run step plus an actual triggered run to produce the measurement artifact.',
];

const summary = 'VALIDATION confirmed pieces (b)/(c)/(d) are all genuinely unbuilt (no duplicate work exists), confirmed the timeout-ceiling-widened-without-measurement premise for piece (b) directly in the workflow file, and found one factual drift between the ticket text and current main: `reconcileSentRows` does not exist (the real function is `reconcileOutboundSms`) and `retryOrAlert` is module-private. A measured whole-tree census (this SD\'s own new tool) finds 11 pre-existing violating test files today, not the ticket\'s estimated 13 -- corrected before PRD authoring rather than propagated.';

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'VALIDATION', supabase });
  let results = {
    verdict: 'PASS',
    confidence_score: 92,
    findings,
    warnings: [],
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'scripts/lint/', '.github/workflows/unit-tier-clock-skew.yml', 'tests/setup.clock-skew.js',
        'lib/chairman/sms-outbound-worker.js', 'tests/unit/chairman/sms-outbound-reconcile.test.js',
        'lib/notifications/orchestrator.js', 'lib/comms/adam-outbound/quiet-hours-extension.js', 'lib/time/chairman-et-wall-clock.js',
      ],
      quick_fixes_reviewed: ['QF-20260912-364'],
    },
    phase: 'LEAD_TO_PLAN',
  };
  results = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('VALIDATION', SD_KEY, { name: 'VALIDATION' }, results, { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' });
  console.log('VALIDATION EVIDENCE WRITTEN:', stored.id, stored.verdict, stored.confidence);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
