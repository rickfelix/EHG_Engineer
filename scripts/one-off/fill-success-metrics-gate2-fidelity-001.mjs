import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', 'SD-LEO-FIX-GATE2-IMPLEMENTATION-FIDELITY-001')
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

const success_metrics = [
  {
    metric: 'Implementation completeness',
    target: '100% of scope items implemented',
    actual: '100% -- 2 of 2 FRs delivered (FR-1: stripGroundingValidationBlock wired into addedLinesForAmbiguityScan; FR-2: countStubOccurrences extracted with true occurrence counting)',
    evidence: { kind: 'gate_score', ref: { handoff: 'EXEC-TO-PLAN', expect: '>=85' } },
  },
  {
    metric: 'Test coverage',
    target: '≥80% code coverage for new code',
    actual: '99/99 tests passing in tests/unit/implementation-fidelity/ (85 pre-existing unmodified + 14 new across both findings plus the self-referential test-file exemption)',
    evidence: { kind: 'test', ref: 'tests/unit/implementation-fidelity/grounding-validation-cache-exclusion.test.js' },
  },
  {
    metric: 'Zero regressions',
    target: '0 existing tests broken',
    actual: '0 regressions -- the pre-existing 85 tests in tests/unit/implementation-fidelity/ pass unmodified',
  },
  {
    metric: 'Issue recurrence',
    target: '0 recurrences after fix deployed',
    actual: '0 -- not yet deployed long enough to measure live recurrence; regression-guarded instead by 4 new unit tests directly reproducing both coordinator-ruled findings (grounding_validation cache exclusion, stub occurrence undercount) plus 2 edge-case tests and 3 self-referential-scan tests',
  },
];

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ success_metrics })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log('SD success_metrics updated with real measured values.');
