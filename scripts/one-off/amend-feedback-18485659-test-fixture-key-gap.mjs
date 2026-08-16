// Second amendment to feedback row 18485659-4f39-4c74-bad0-f813b266a0e8 (S5 finding from
// SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001).
//
// The mandatory deep-tier adversarial ship review of PR #7126 (pre-merge, PR-level review)
// re-measured the recommended fix shape from this row's first amendment
// (CASCADE_FENCE_AXES = CLAIM_WRITE_FENCE_AXES union {one_way_door, co_author_pending}) and
// found it is ITSELF narrower than the measured gap: test_fixture_key is also excluded from
// CLAIM_WRITE_FENCE_AXES, and the general classifier refuses it too (measured, all five
// axes checked against the real classifier for a fenced+orchestrator-typed fixture: only
// human_action_required and orchestrator_parent fire in the current test; the other three,
// including test_fixture_key, are architecturally the same class of gap even though not
// live-exploitable today per their own read-only DB probe: 0 rows currently admitted by the
// new cascade fence while carrying a non-fence ineligibility axis).
//
// CITATION CORRECTION (independently verified before amending): the adversarial review cited
// "correct-prd-lead-final-cascade-isolation-001-round7.mjs:13 cites 11 such residual
// production rows" as evidence for the test_fixture_key leak risk. That citation is WRONG --
// round7.mjs:16's "11 residual production rows" comment is about a completely different,
// unrelated incident (tests/helpers/credential-fence.js's SD-LEO-FIX-CREDENTIAL-GUARD-
// INVERSION-001 live-write-test incident, not test_fixture_key or belt-leaking at all). The
// UNDERLYING point about test_fixture_key leaking is still correct and properly evidenced --
// just by a different source: lib/fleet/claim-eligibility.cjs:43-48's own comment (QF-
// 20260703-773) documents bare TEST-/DEMO--prefixed fixtures (no SD- prefix) leaking onto the
// real claimable belt when afterEach cleanup was interrupted. Recording the correct citation
// here so a future reader following this row's evidence trail lands on the right file.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FEEDBACK_ID = '18485659-4f39-4c74-bad0-f813b266a0e8';

const { data: row, error: fetchErr } = await supabase
  .from('feedback')
  .select('description')
  .eq('id', FEEDBACK_ID)
  .single();

if (fetchErr) {
  console.error('FETCH_ERROR', fetchErr.message);
  process.exit(1);
}

const amendment = `SECOND AMENDMENT (2026-08-16, via the mandatory deep-tier adversarial ship review of PR #7126, independently re-verified before recording): the recommended fix shape in the amendment above (CASCADE_FENCE_AXES = CLAIM_WRITE_FENCE_AXES union {one_way_door_requires_supervision, co_author_pending}) is ITSELF narrower than the measured gap -- test_fixture_key is excluded from CLAIM_WRITE_FENCE_AXES too, and is the same class of gap (enforced by the general classifier at other call sites, not re-checked at the cascade-picker claim-write boundary). Not live-exploitable today: the review's own read-only probe replicating selectNextSD's exact candidate query against the live DB found 0 currently-admitted rows carrying a non-fence ineligibility axis. CORRECTED fix-shape recommendation: CASCADE_FENCE_AXES should union CLAIM_WRITE_FENCE_AXES with {one_way_door_requires_supervision, co_author_pending, test_fixture_key}, not just the first two.

CITATION CORRECTION: the review cited "correct-prd-lead-final-cascade-isolation-001-round7.mjs:13 cites 11 such residual production rows" as evidence for the test_fixture_key leak risk -- that citation is WRONG, round7.mjs's "11 residual production rows" comment is about an unrelated incident (tests/helpers/credential-fence.js's SD-LEO-FIX-CREDENTIAL-GUARD-INVERSION-001 live-write-test issue). The underlying test_fixture_key concern is still correctly evidenced, just by a different source: lib/fleet/claim-eligibility.cjs:43-48 (QF-20260703-773) documents bare TEST-/DEMO--prefixed fixtures leaking onto the real claimable belt when afterEach cleanup was interrupted.

--- PRIOR TEXT (preserved for provenance) ---
${row.description}`;

const { error: updateErr } = await supabase
  .from('feedback')
  .update({ description: amendment })
  .eq('id', FEEDBACK_ID);

if (updateErr) {
  console.error('UPDATE_ERROR', updateErr.message);
  process.exit(1);
}

console.log('AMENDED', FEEDBACK_ID);
