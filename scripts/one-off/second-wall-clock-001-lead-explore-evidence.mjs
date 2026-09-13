#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-FIX-SECOND-WALL-CLOCK-001, LEAD-TO-PLAN phase.
 *
 * Records the discovery work performed confirming the clock-skew sweep's reporting defect and
 * scoping this SD down to piece (a) of the coordinator's scope rewrite only.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-FIX-SECOND-WALL-CLOCK-001';

const findings = [
  {
    id: 'report-step-condition-confirmed-and-fixed',
    severity: 'HIGH',
    summary: '.github/workflows/unit-tier-clock-skew.yml\'s report step was `if: failure()`, which does not match a CANCELLED job (GitHub Actions\' own outcome vocabulary: success/failure/cancelled/skipped) -- exactly how all four real runs of this workflow ended (timeout-minutes 55 ceiling firing). Confirmed and fixed: step now runs `if: always()`, with the vitest step\'s own outcome threaded through via SKEW_RUN_OUTCOME so the reporting script can distinguish a genuine completed-red run (parse the log) from a run that never finished (file a distinct "did not complete" row).',
  },
  {
    id: 'reporting-script-silent-pass-confirmed-and-fixed',
    severity: 'HIGH',
    summary: 'scripts/clock-skew-report-failures.mjs\'s main() read zero FAIL lines on a cancelled/truncated log and logged "nothing to report" -- indistinguishable from a genuine clean pass. Fixed via isIncompleteOutcome()/reportIncompleteSweep(): a non-success/non-failure outcome now files one harness_backlog row naming the outcome, never silence.',
  },
  {
    id: 'scope-narrowed-to-piece-a-only',
    severity: 'INFO',
    summary: 'This SD\'s stored scope field documents a LEAD-phase reduction (scope_reduction_percentage=75) from the coordinator\'s full 5-piece rewrite down to piece (a) alone. Pieces (b) (measure the actual +45d overrun before touching the timeout ceiling), (c) (extend tests/setup.clock-skew.js with an absolute TEST_CLOCK_PIN_ISO pin + a new CI matrix leg), and (d) (the wall-clock-test lint tool over the 13-file baseline) are each independently substantial builds and are deliberately deferred to a follow-up SD rather than crammed into this ticket.',
  },
  {
    id: 'no-duplicate-sds-on-this-narrowed-scope',
    severity: 'INFO',
    summary: 'Searched strategic_directives_v2 for open work on "clock-skew sweep", "unit-tier-clock-skew", "SKEW_RUN_OUTCOME" -- none found besides this SD and its source QF-20260912-364 (now status=escalated, escalated_to_sd_id=this SD). The leo-create-sd.js dedup pass flagged SD-LEO-INFRA-COORDINATOR-WORKER-REVIVAL-001 as a possible duplicate on generic keyword overlap (worker/session/revival) -- read its description directly and confirmed it is an unrelated, already-completed SD about coordinator-driven worker respawn, not clock-skew CI. False positive, no action needed.',
  },
];

const warnings = [
  'The VALIDATION sub-agent\'s hallucination check flagged tests/setup/pinned-clock.js and tests/unit/hygiene/clock-skew-reapplication.test.js as referenced-but-nonexistent -- both are correctly unbuilt: the first is the ORIGINAL (superseded) scope text explicitly marked "DO NOT BUILD" by the coordinator\'s rewrite, kept in the scope field for history; the second is piece (c)\'s deferred-to-follow-up test extension, not yet created because piece (c) itself is deferred.',
];

const recommendations = [
  'PLAN should author the PRD scoped ONLY to piece (a) (already implemented and unit-tested on this branch), with an explicit FR or note naming pieces (b)-(d) as out-of-scope-for-this-SD and pointing to a named follow-up ticket once filed.',
  'EXEC work is effectively already done (inherited from the escalated QF-20260912-364 commit c5c02526b5a) -- PLAN-TO-EXEC should verify the existing diff against the narrowed PRD rather than expecting new implementation.',
];

const summary = 'Explore-phase discovery for SD-LEO-FIX-SECOND-WALL-CLOCK-001 confirmed the clock-skew sweep\'s if: failure() vs cancelled-job mismatch at the exact workflow file and line, confirmed the reporting script\'s silent-pass defect, and validated the LEAD-phase scope reduction to piece (a) only (already implemented) with pieces (b)-(d) explicitly deferred. No duplicate open SDs exist on this narrowed scope; one keyword-overlap dedup flag was checked and confirmed a false positive.';

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
    confidence_score: 95,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        '.github/workflows/unit-tier-clock-skew.yml',
        'scripts/clock-skew-report-failures.mjs',
        'tests/unit/hygiene/clock-skew-report-failures.test.js',
      ],
      quick_fixes_reviewed: ['QF-20260912-364'],
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
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
