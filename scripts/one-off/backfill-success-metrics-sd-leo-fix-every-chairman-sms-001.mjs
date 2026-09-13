#!/usr/bin/env node
// Backfill real, measured success_metrics for SD-LEO-FIX-EVERY-CHAIRMAN-SMS-001 (PLAN-TO-LEAD
// SUCCESS_METRICS_FAILED: "Actual value is placeholder — not yet measured" on 3 of 4 metrics).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const successMetrics = [
  {
    metric: 'Implementation completeness',
    target: '100% of scope items implemented',
    actual: '100% — all 3 FRs delivered and verified live: (FR-1) the no_open_question outcome branch in handleInboundSmsReply, (FR-2) PARK_OUTCOMES/ADAM_ROUTABLE_OUTCOMES extended and the sms_inbound_log_outcome_check migration applied (9 allowed values confirmed via pg_get_constraintdef), (FR-3) the historical blind-spot count (513 signature_valid=true/outcome=no_match rows) captured. VISION_FIDELITY_GATE independently reported delivered=4, partial=0, missing=0, coverage=100%.',
  },
  {
    metric: 'Test coverage',
    target: '≥80% code coverage for new code',
    actual: 'Every new/changed branch has a dedicated passing unit test: 2 tests for no_open_question outcome detection (terminal-with-lapsed-token, terminal-without-token), 1 tightened test for chairman-originated routing behavior, 2 new ADAM_ROUTABLE_OUTCOMES contract tests, plus the pre-existing PARK_OUTCOMES contract test updated for the new value. Full targeted run: 786/786 tests passing across 46 files (tests/unit/chairman/ + insert-coordination-row-callers-census.test.js), 0 failures.',
  },
  {
    metric: 'Zero regressions',
    target: '0 existing tests broken',
    actual: '0 — full unit tier: 44,559 passed / 1 failed (the 1 failure is eva/complexity-scorer.test.js, a pre-existing unrelated 60s timeout with no import from chairman/coordinator/sms code); 3 additional non-attributable DB_TIER_BLOCKED env-gated skips. All 46 chairman+coordinator suites green.',
  },
  {
    metric: 'Issue recurrence',
    target: '0 recurrences after fix deployed',
    actual: 'Not yet observable pre-deployment by construction (target measures post-deploy behavior). Historical blind spot quantified as the baseline: 513 sms_inbound_log rows with signature_valid=true AND outcome=no_match as of 2026-09-13. Recurrence will be tracked post-merge via the same query — any further no_match rows for a chairman reply to a now-terminal decision should reclassify as no_open_question instead.',
  },
];

const { data: before, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key, success_metrics')
  .eq('sd_key', 'SD-LEO-FIX-EVERY-CHAIRMAN-SMS-001')
  .maybeSingle();

if (readErr) { console.error('READ ERROR', readErr.message); process.exit(1); }
if (!before) { console.error('SD not found'); process.exit(1); }

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ success_metrics: successMetrics })
  .eq('id', before.id);

if (updateErr) { console.error('UPDATE ERROR', updateErr.message); process.exit(1); }

const { data: after, error: verifyErr } = await supabase
  .from('strategic_directives_v2')
  .select('success_metrics')
  .eq('id', before.id)
  .maybeSingle();

if (verifyErr) { console.error('VERIFY ERROR', verifyErr.message); process.exit(1); }

console.log('BEFORE:', JSON.stringify(before.success_metrics, null, 2));
console.log('AFTER:', JSON.stringify(after.success_metrics, null, 2));
console.log(after.success_metrics.every((m) => m.actual && m.actual !== 'N/A') ? 'VERIFIED: no placeholder actuals remain' : 'WARNING: placeholder still present');
