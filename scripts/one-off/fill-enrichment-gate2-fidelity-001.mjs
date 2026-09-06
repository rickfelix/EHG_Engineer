import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const smoke_test_steps = [
  { step_number: 1, instruction: 'Run: npx vitest run tests/unit/implementation-fidelity/', expected_outcome: 'All tests pass (85 pre-existing + 8 new)' },
  { step_number: 2, instruction: 'Feed a synthetic diff with a marker word inside a grounding_validation JSON block to stripGroundingValidationBlock()', expected_outcome: 'The marker word is elided; sibling authored content is preserved' },
  { step_number: 3, instruction: 'Feed a synthetic diff with 2 identical-text stub-pattern matches to countStubOccurrences()', expected_outcome: 'occurrenceCount returns 2, not 1' },
];

const key_changes = [
  { change: 'scripts/modules/implementation-fidelity/preflight/index.js gains stripGroundingValidationBlock(), wired into the shared addedLinesForAmbiguityScan() chokepoint', impact: 'A marker word inside the derived grounding_validation cache no longer permanently blocks a genuinely-clean SD (Finding A)' },
  { change: 'Same file gains countStubOccurrences(), extracted from checkStubbedCode()\'s prior inline dedup-by-line-text logic', impact: 'The stub-pattern instance count now reflects true occurrence count, not unique-line count (Finding B)' },
  { change: 'Two new unit test files added (grounding-validation-cache-exclusion.test.js, stub-occurrence-counting.test.js)', impact: 'Both findings are regression-guarded; existing 85-test suite passes unmodified' },
];

const success_criteria = [
  { criterion: 'A marker word inside an added grounding_validation JSON sub-object is excluded from GATE2\'s scan surface', measure: 'Verified: tests/unit/implementation-fidelity/grounding-validation-cache-exclusion.test.js passes, including the sibling-key-preserved and authored-text-still-scanned cases' },
  { criterion: 'The same marker word in genuinely-authored PRD text (outside grounding_validation) still triggers the scan', measure: 'Verified: same test file\'s first test asserts the authored FR-1 description\'s "ambiguous" hit survives the strip' },
  { criterion: 'Stub-pattern occurrence count reflects true regex match count, not unique-line count', measure: 'Verified: tests/unit/implementation-fidelity/stub-occurrence-counting.test.js\'s primary regression test asserts occurrenceCount=2 for 2 identical-text occurrences' },
  { criterion: 'Zero regressions in the existing preflight test suite', measure: 'Verified: npx vitest run tests/unit/implementation-fidelity/ -- 93/93 passing (85 pre-existing unmodified + 8 new)' },
];

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', 'SD-LEO-FIX-GATE2-IMPLEMENTATION-FIDELITY-001')
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ smoke_test_steps, key_changes, success_criteria })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log('SD enrichment fields updated.');
