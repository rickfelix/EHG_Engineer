// SD-LEO-INFRA-CHAIRMAN-ALL-DECISION-001 — LEAD-phase evaluation write.
//
// Replaces the /leo-create template placeholders ([UNPOPULATED] etc.) with the actual LEAD
// evaluation content, informed by: the migration file itself (already staged and header-
// corrected), the risk-agent's LEAD-phase review, and independent re-verification of the
// corrected root cause (lib/quality/assist-engine.js:768, not snooze-manager.js).

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-CHAIRMAN-ALL-DECISION-001';

const update = {
  rationale:
    'A chairman-facing decision-queue view (chairman_all_decision_signals) never consults ' +
    'snoozed_until on its flag_review (feedback) branch, so a critical/high row a chairman/' +
    'operator deferred via /leo assist this_week/next_week (which sets status=\'backlog\' + ' +
    'snoozed_until) still surfaces for immediate attention — defeating the deferral. Fixing a ' +
    'chairman-facing defect in the decision queue itself (not routed to harness_backlog) per ' +
    'standing policy on chairman-facing defects.',
  key_changes: [
    {
      change:
        'CREATE OR REPLACE VIEW public.chairman_all_decision_signals: flag_review branch WHERE ' +
        'gains exactly one ANDed clause — (f.snoozed_until IS NULL OR f.snoozed_until <= now()) — ' +
        'all 6 other branches and every other clause of this branch are byte-identical to the ' +
        'live pg_get_viewdef capture.',
      impact:
        'A critical/high feedback row deferred via /leo assist this_week/next_week no longer ' +
        'surfaces in the chairman queue until its snooze genuinely expires; a row whose snooze ' +
        'has already expired still re-surfaces (no dependency on the background sweep having run).'
    },
    {
      change: 'Paired rollback (_DOWN.sql) restoring the pre-change live definition verbatim.',
      impact: 'A safe, verified revert path if the migration needs to be backed out post-apply.'
    },
    {
      change:
        'Migration-shape test (11 assertions) pinning the one intended clause, byte-identical ' +
        'other branches, staging discipline, and DOWN-file correctness.',
      impact: 'Future edits to this view cannot silently widen or narrow this migration\'s blast radius.'
    }
  ],
  success_criteria: [
    {
      criterion: 'The flag_review branch gains exactly the one snoozed_until exclusion clause, ANDed onto the existing predicate',
      measure: 'tests/unit/migrations/chairman-all-decision-signals-snoozed-exclusion-migration-shape.test.js SNOOZE-1 group (3 assertions) passes'
    },
    {
      criterion: 'No other branch or clause of the view changes vs. the live pg_get_viewdef capture',
      measure: 'SNOOZE-2 group (4 assertions: 7 branches preserved, security_invoker preserved, correct view targeted, no other branch mentions snoozed_until) passes'
    },
    {
      criterion: 'Migration stays staged (chairman-gated, unapplied) until a chairman ratifies it',
      measure: 'SNOOZE-3 group (3 assertions: staging directory, @approved-by:<PENDING> marker, DOWN file correctness) passes'
    }
  ],
  risks: [
    {
      risk:
        'Original F3 finding named /inbox snooze (lib/quality/snooze-manager.js) as the live ' +
        'writer of snoozed_until; corrected during LEAD risk review to lib/quality/assist-engine.js:768 ' +
        '(/leo assist this_week/next_week) — snooze-manager.js writes status values ' +
        '(\'snoozed\'/\'open\') rejected by feedback_status_check and has zero callers.',
      impact: 'low',
      likelihood: 'low',
      mitigation:
        'Migration header and SD description/scope both corrected to cite the verified writer; ' +
        'the fix predicate itself is unaffected by which writer is real. The dead snooze-manager.js ' +
        'write paths are a separate, genuine defect — tracked for a follow-up QF, out of this SD\'s scope.'
    },
    {
      risk:
        'Live-affected-row count is measured at 0 today (only 1 non-null snoozed_until in the ' +
        'whole feedback table, outside the critical/high population), so the fix has no visible ' +
        'effect on today\'s queue.',
      impact: 'low',
      likelihood: 'medium',
      mitigation:
        'The 404-408 figure cited in the original finding is the branch\'s total ELIGIBLE ' +
        'population (critical/high, unresolved, non-terminal), not the affected-today count — the ' +
        'gap is prospective (protects future /leo assist deferrals), not corrective of a live queue backlog.'
    }
  ],
  scope_reduction_percentage: 40,
  smoke_test_steps: [
    'Run: npx vitest run tests/unit/migrations/chairman-all-decision-signals-snoozed-exclusion-migration-shape.test.js — all 11 assertions pass.',
    'Open a psql/pooler session; BEGIN; run the migration\'s CREATE OR REPLACE VIEW statement; SELECT count(*) FROM chairman_all_decision_signals WHERE decision_type=\'flag_review\' before/after — counts match (0 live snoozed rows today means no visible delta, confirming no accidental over-exclusion).',
    'Insert a throwaway critical-severity feedback row with snoozed_until = now() + interval \'1 day\'; confirm it does NOT appear in chairman_all_decision_signals; update snoozed_until to now() - interval \'1 hour\'; confirm it DOES reappear. ROLLBACK the transaction (never COMMIT in this smoke test).',
    'Chairman ratifies via the standard chairman-gated apply ceremony (stamps @approved-by), then the migration is applied for real outside this transaction.'
  ]
};

async function main() {
  const { error } = await supabase
    .from('strategic_directives_v2')
    .update(update)
    .eq('sd_key', SD_KEY);
  if (error) throw new Error(`write failed: ${error.message}`);

  const { data: after, error: verifyErr } = await supabase
    .from('strategic_directives_v2')
    .select('key_changes, success_criteria, risks, scope_reduction_percentage, smoke_test_steps, rationale')
    .eq('sd_key', SD_KEY)
    .single();
  if (verifyErr) throw new Error(`verify failed: ${verifyErr.message}`);

  if (after.scope_reduction_percentage !== update.scope_reduction_percentage) {
    throw new Error('VERIFY FAILED: scope_reduction_percentage did not persist');
  }
  if (!Array.isArray(after.smoke_test_steps) || after.smoke_test_steps.length !== update.smoke_test_steps.length) {
    throw new Error('VERIFY FAILED: smoke_test_steps did not persist');
  }
  console.log(`OK: ${SD_KEY} LEAD evaluation fields written and verified.`);
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
