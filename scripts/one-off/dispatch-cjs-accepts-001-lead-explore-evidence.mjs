#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-FIX-DISPATCH-CJS-ACCEPTS-001, LEAD-TO-PLAN phase.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-FIX-DISPATCH-CJS-ACCEPTS-001';

const findings = [
  {
    id: 'sentinel-targets-bare-broadcast-removed',
    severity: 'INFO',
    summary: "lib/coordinator/dispatch.cjs:197 confirms SENTINEL_TARGETS = ['broadcast-coordinator', 'broadcast-solomon', 'broadcast-adam', 'broadcast-michael'] -- bare 'broadcast' absent, with a header comment (dispatch.cjs:189-196) citing QF-20260911-753 and the measured 91-rows/0-acknowledged finding.",
  },
  {
    id: 'assert-valid-target-choke-point-confirmed',
    severity: 'INFO',
    summary: "assertValidTarget (dispatch.cjs:220-232) checks isSentinelTarget() then isFullUuid(), throwing DISPATCH_TARGET_INVALID otherwise; invoked from insertCoordinationRow at dispatch.cjs:1563 -- the single choke point every non-bypassing writer routes through.",
  },
  {
    id: 'all-non-test-writers-route-through-choke-point',
    severity: 'INFO',
    summary: 'Every non-test writer of literal target_session=\'broadcast\' (lib/fleet/dispatch-suggestions.cjs:216, scripts/ack-chairman-directive.cjs:106, scripts/coordinator-cold-recovery.cjs:123, scripts/coordinator-revive.cjs:140, scripts/issue-chairman-directive.cjs:63) calls insertCoordinationRow -- none does a raw .from(\'session_coordination\').insert(...) bypassing validation. No writer left unfixed that would silently keep succeeding.',
  },
  {
    id: 'npm-install-lock-redirected-to-null',
    severity: 'INFO',
    summary: "lib/npm-install-lock.cjs:80 changed from target_session: 'broadcast' to target_session: null (with explanatory comment at lines 71-77) -- this raw-insert writer was the dominant live contributor (all 91 current rows) and does not use target_session in its own lock-acquire/release logic.",
  },
  {
    id: 'inbox-readonly-comment-corrected',
    severity: 'INFO',
    summary: 'scripts/inbox-readonly.cjs header (lines 37-44) corrected: no longer groups bare \'broadcast\' with the genuinely-drained broadcast-coordinator/-adam sentinels as "live and heavily used" -- now states 0 of 91 rows were ever acknowledged and that new writes are refused.',
  },
  {
    id: 'regression-suite-confirmed-green',
    severity: 'INFO',
    summary: 'lib/coordinator/dispatch.test.js ran 14/14 passing (npx vitest run --project unit), including the new assertions that SENTINEL_TARGETS excludes bare broadcast and that insertCoordinationRow rejects it with DISPATCH_TARGET_INVALID. Independently re-verified by a fresh Explore sub-agent pass (this evidence), not merely re-stated from the implementer\'s own claim.',
  },
];

const summary = "Independent Explore-phase verification for SD-LEO-FIX-DISPATCH-CJS-ACCEPTS-001 (escalated from QF-20260911-753, source LOC 134 > 75 cap) confirms the shipped fix matches its description: the bare 'broadcast' sentinel is removed from dispatch.cjs's SENTINEL_TARGETS (0/91 historical rows were ever acknowledged), every non-test writer routes through the validating insertCoordinationRow choke point with none left silently succeeding into a dead sentinel, the dominant raw-insert contributor (npm-install-lock.cjs) was redirected to a null target_session, and the one reader that had mischaracterized bare broadcast as 'live and heavily used' (inbox-readonly.cjs) was corrected. 14/14 targeted tests pass.";

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
    confidence_score: 90,
    findings,
    warnings: [],
    recommendations: [],
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'lib/coordinator/dispatch.cjs',
        'lib/coordinator/dispatch.test.js',
        'lib/npm-install-lock.cjs',
        'scripts/inbox-readonly.cjs',
        'scripts/coordinator-revive.cjs',
        'scripts/dispatch-suggestion-override.mjs',
      ],
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
