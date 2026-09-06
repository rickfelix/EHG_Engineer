#!/usr/bin/env node
// Replaces placeholder "N/A" actuals in success_metrics with real measured values now that
// EXEC-TO-PLAN has completed for SD-LEO-FIX-GATE-PLAN-EXEC-001.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-GATE-PLAN-EXEC-001';

async function main() {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('success_metrics')
    .eq('sd_key', SD_KEY)
    .single();
  if (error) { console.error('❌ Fetch failed:', error.message); process.exit(1); }

  const metrics = data.success_metrics.map((m) => {
    if (m.metric === 'Implementation completeness') {
      return { ...m, actual: '100% -- all 5 functional requirements (FR-1..FR-5) implemented in gate-1-plan-to-exec.js, cross-referenced in PlanToExecVerifier.js (commits 6f25879da8b, 84ac4fe2099, fa93c757ac8, PR #8263)' };
    }
    if (m.metric === 'Test coverage') {
      return { ...m, actual: '11/11 new unit tests passing (tests/unit/plan-to-exec/gate1-prd-quality-leniency.test.js, covering TS-1..TS-9); 129 files / 1235 tests passing in the full tests/unit/handoff/ tree with 0 regressions' };
    }
    if (m.metric === 'Zero regressions') {
      return { ...m, actual: '0 regressions confirmed twice independently (once via a one-off measurement script, once by testing-agent importing and invoking the actual registered validator) across the full live PRD population (4679 PRDs, 4619 heuristic-path), plus 0 sibling-test regressions in tests/unit/handoff/' };
    }
    if (m.metric === 'Issue recurrence') {
      return { ...m, actual: 'Not yet measurable at PLAN-TO-LEAD time (0 recurrences requires post-deploy observation window) -- tracked via the 5 regression tests (TS-1, TS-4a/4b, TS-9) that pin the exact defect classes found (schema-mismatch regression, quality-floor hole) so any future recurrence fails CI immediately rather than accumulating silently' };
    }
    return m;
  });

  const { error: updErr } = await supabase
    .from('strategic_directives_v2')
    .update({ success_metrics: metrics })
    .eq('sd_key', SD_KEY);
  if (updErr) { console.error('❌ Update failed:', updErr.message); process.exit(1); }

  console.log('✅ success_metrics actuals updated with real measured values (no more N/A placeholders).');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
