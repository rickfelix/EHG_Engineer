import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const key_changes = [
  { change: "scripts/coordinator-self-review.mjs: worker-directed periodic-review solicitation (line ~156) now sets top-level `body` alongside `payload.body` (was payload-only, top-level NULL).", type: "fix" },
  { change: "scripts/coordinator-self-review.mjs: Adam-directed bidirectional review solicitation (line ~170) now sets top-level `body: adamBody` alongside `payload.body: adamBody`.", type: "fix" },
  { change: "scripts/coordinator-comms-check.mjs: COMMS CHECK ping (line ~84) now sets top-level `body` alongside `payload.body`.", type: "fix" },
];

const success_criteria = [
  { criterion: "Every coaching/self-review row written by the 3 fixed emitter call sites has a non-empty top-level body column", measure: "tests/unit/coordinator-coaching-body-column.test.js static-source assertions pass for all 3 sites" },
  { criterion: "A regression asserts top-level body === payload.body for these kinds", measure: "New test file asserts the same source variable feeds both the top-level `body` key and `payload.body` at each site" },
  { criterion: "No reader path depends on payload.body-only for these kinds", measure: "scripts/hooks/coordination-inbox.cjs already reads only the top-level body column; once writers populate it, the existing reader works with zero reader-side changes" },
];

const smoke_test_steps = [
  { step_number: 1, instruction: "Run `node scripts/coordinator-comms-check.mjs` in a session with at least one live worker (or a test fixture worker row)", expected_outcome: "The inserted session_coordination row has a non-null top-level `body` column matching payload.body, verifiable via a direct DB select" },
  { step_number: 2, instruction: "Trigger a coordinator-self-review.mjs DUE cycle (or directly call insertCoordinationRow with the same shape) for a worker-directed periodic review", expected_outcome: "The resulting COACHING row's top-level body is non-empty and equals payload.body" },
  { step_number: 3, instruction: "Run `npx vitest run tests/unit/coordinator-coaching-body-column.test.js`", expected_outcome: "All static-source regression assertions pass, confirming the fix is present at all 3 call sites and cannot silently regress" },
];

const { error } = await supabase
  .from('strategic_directives_v2')
  .update({ key_changes, success_criteria, smoke_test_steps })
  .eq('sd_key', 'SD-LEO-INFRA-COACHING-BODY-COLUMN-001');

if (error) { console.error(error); process.exit(1); }
console.log('SD fields updated.');
