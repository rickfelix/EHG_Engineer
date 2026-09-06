import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: prd, error: readErr } = await supabase
  .from('product_requirements_v2')
  .select('id, acceptance_criteria, test_scenarios')
  .eq('directive_id', 'SD-LEO-FIX-GATE2-IMPLEMENTATION-FIDELITY-001')
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

const acceptance_criteria = [
  ...(Array.isArray(prd.acceptance_criteria) ? prd.acceptance_criteria : []),
  'Both Finding A (grounding_validation cache exclusion) and Finding B (occurrence-counting fix) are shipped as pure, exported functions consistent with the existing stripClassificationLabelEnums precedent',
];

const test_scenarios = [
  ...(Array.isArray(prd.test_scenarios) ? prd.test_scenarios : []),
  {
    id: 'TS-3',
    scenario: 'Existing preflight test suite regression guard',
    type: 'unit',
    expected: 'npx vitest run tests/unit/implementation-fidelity/ passes 95/95 (85 pre-existing unmodified + 10 new)',
  },
  {
    id: 'TS-4',
    scenario: 'Edge case: a grounding_validation block at the end of a diff with no trailing sibling key',
    type: 'unit',
    expected: 'stripGroundingValidationBlock does not throw and correctly closes the block at the final matching brace',
  },
  {
    id: 'TS-5',
    scenario: 'Error condition: malformed/unbalanced braces in a grounding_validation value',
    type: 'unit',
    expected: 'The depth tracker degrades gracefully (does not throw); real PRD JSON is always well-formed via JSON.stringify so this is a defensive-only scenario',
  },
];

const { error: writeErr } = await supabase
  .from('product_requirements_v2')
  .update({ acceptance_criteria, test_scenarios })
  .eq('id', prd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log('PRD acceptance_criteria and test_scenarios extended.');
