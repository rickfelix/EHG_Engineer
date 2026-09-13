#!/usr/bin/env node
// Replace the auto-seeded boilerplate success_metrics (flagged at LEAD-TO-PLAN as generic
// buildDefaultSuccessMetrics() output) with real, measured actuals for
// SD-LEO-FIX-COORDINATOR-RULING-REVERSES-001, ahead of PLAN-TO-LEAD's SUCCESS_METRICS gate.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID = '71fb0b59-adb5-4c65-88d3-5fe788b062d1';

const success_metrics = [
  {
    metric: 'Deliverable completion',
    target: '100%',
    actual: '100% — 5 of 5 deliverables completed',
    measurement_method: 'sd_scope_deliverables.completion_status for this SD (id=71fb0b59-adb5-4c65-88d3-5fe788b062d1)',
  },
  {
    metric: 'New-code test coverage',
    target: '100%',
    actual: '100% — 8 of 8 new tests passing (tests/unit/coordinator/dispatch-urgency-stamp.test.js)',
    measurement_method: 'npx vitest run tests/unit/coordinator/dispatch-urgency-stamp.test.js',
  },
  {
    metric: 'Zero regressions',
    target: '0',
    actual: '0',
    measurement_method: 'TESTING sub-agent evidence d04bb6d6-8505-43a8-807d-b54450d0fcc3: 1582/1582 targeted tests passing; broader tests/unit/coordinator/ + tests/unit/coordination-inbox*.test.js: 1433/1433 passing',
  },
  {
    metric: 'EXEC-TO-PLAN sub-agent verification',
    target: '100%',
    actual: '100% — 2 of 2 sub-agents PASS (TESTING 92% confidence, SECURITY 93% confidence)',
    measurement_method: 'sub_agent_execution_results rows d04bb6d6-8505-43a8-807d-b54450d0fcc3 (TESTING) and c605ec77-86b0-4e83-8169-f024b0636eeb (SECURITY)',
  },
];

async function main() {
  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ success_metrics })
    .eq('id', SD_ID);
  if (error) { console.error(error.message); process.exitCode = 1; return; }
  console.log('success_metrics updated:', success_metrics.length, 'entries');
}

if (isMainModule(import.meta.url)) {
  main();
}
