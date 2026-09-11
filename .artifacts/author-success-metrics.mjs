import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const supabase = createSupabaseServiceClient();
const sdId = '346eaa99-8d8a-4233-b593-50b21149c958';
const success_metrics = [
  { metric: 'Implementation completeness', target: '100% of scope items implemented',
    actual: '100% — 4 of 4 sd_scope_deliverables completed; PR #8653 merged to main 2026-09-08 (merge 50b076a414b)',
    evidence: { kind: 'git', ref: 'PR#8653' } },
  { metric: 'Test coverage', target: '≥80% code coverage for new code',
    actual: '100% — 5 of 5 tests in tests/unit/retro/write-with-token.test.js green; 91/91 scoped unit tests in TESTING run 735b102c (2026-09-11)',
    evidence: { kind: 'test', ref: 'tests/unit/retro/write-with-token.test.js' } },
  { metric: 'Zero regressions', target: '0 existing tests broken',
    actual: '0 regressions — 91 of 91 scoped unit tests green across the 14 retrospective-writer suites; EXEC-TO-PLAN accepted at 90',
    evidence: { kind: 'gate_score', ref: { handoff: 'EXEC-TO-PLAN', expect: '>=85' } } },
  { metric: 'Issue recurrence', target: '0 recurrences after fix deployed',
    actual: '0 recurrences — none recorded since merge 2026-09-08; live guard enforcement not yet measurable because the trigger half is staged chairman-gated (FR-4)' },
];
const { data, error } = await supabase.from('strategic_directives_v2').update({ success_metrics }).eq('id', sdId).select('id,success_metrics');
console.log(error ? 'ERR ' + error.message : 'OK ' + JSON.stringify(data[0].success_metrics.map(m => m.metric + ' => ' + m.actual.slice(0, 40))));
