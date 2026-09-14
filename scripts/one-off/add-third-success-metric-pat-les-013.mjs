#!/usr/bin/env node
/**
 * GATE_SD_METRICS_SUFFICIENCY (LEAD-TO-PLAN) requires >=3 unique success_metrics.
 * Adds a 3rd distinct, measurable outcome to SD-LEARN-FIX-ADDRESS-PAT-LES-013 covering the
 * mutation-testing verification of the new regression guard, alongside the 2 already recorded
 * (pattern recurrence rate, boilerplate-penalty blend test coverage).
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { isMainModule } from '../../lib/utils/is-main-module.js';

dotenv.config();

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-013';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: existing, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('success_metrics')
    .eq('sd_key', SD_KEY)
    .single();

  if (readErr) { console.error('READ FAILED:', readErr.message); process.exit(1); }

  const successMetrics = [
    ...existing.success_metrics,
    {
      metric: 'Regression guard non-vacuity (mutation-tested)',
      baseline: 'A new test suite has no evidence it actually detects the regression it claims to guard against',
      target: 'Disabling the boilerplate-penalty subtraction locally causes the new tests to fail',
      actual: 'Confirmed twice independently: primary session disabled the penalty subtraction at retrospective-quality-rubric.js:505 (`if (false && boilerplateResult.hasBoilerplate)`), observed 2/3 new tests fail, then restored cleanly (git diff empty); the VALIDATION sub-agent independently re-ran the same mutation and reproduced the identical result',
      measurement: 'Temporarily mutate scripts/modules/rubrics/retrospective-quality-rubric.js:505, re-run tests/unit/retrospective-quality-rubric-boilerplate-blend.test.js, confirm failures, then git checkout -- to restore'
    }
  ];

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({ success_metrics: successMetrics })
    .eq('sd_key', SD_KEY)
    .select('sd_key')
    .single();

  if (error) { console.error('FAILED:', error.message); process.exit(1); }

  console.log('UPDATED:', data.sd_key, '-- success_metrics count:', successMetrics.length);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
