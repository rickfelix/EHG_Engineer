// Third amendment to feedback row 18485659-4f39-4c74-bad0-f813b266a0e8.
//
// adversarial-ship-review-cascade-isolation independently re-verified the citation correction
// from the second amendment, confirmed it was right, then found the evidence it had
// originally cited actually belongs to a DIFFERENT axis on the same list --
// unactionable_venture_remediation -- which turns out to be more strongly evidenced than any
// of the other three uncovered axes: BOTH a documented live incident on another dispatch
// surface (self-claim crashed on a vanished fixture row) AND documented production residue
// (the same incident class the credential-fence.js citation was originally, wrongly, applied
// to). Independently re-verified before recording: read claim-eligibility.cjs:273-291
// directly, confirmed the axis definition and the live-incident comment text verbatim;
// confirmed SD-LEO-FIX-REMEDIATION-LINT-MEDIUM-005 does NOT match TEST_FIXTURE_KEY_RE
// (/^(SD-)?(DEMO|TEST)\b/i) -- "LEO" is neither DEMO nor TEST.

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

const amendment = `THIRD AMENDMENT (2026-08-16, via adversarial-ship-review-cascade-isolation's follow-up after the citation correction, independently re-verified before recording -- confirmed claim-eligibility.cjs:273-291 directly and the TEST_FIXTURE_KEY_RE non-match): unactionable_venture_remediation deserves MORE weight in the eventual CASCADE_FENCE_AXES superset than the flat listing in the prior amendment implied. It carries BOTH a documented live incident on another dispatch surface (claim-eligibility.cjs:277-280: a worker self-claimed SD-LEO-FIX-REMEDIATION-LINT-MEDIUM-005, a live fr-c-generator.test.js fixture row with fc000000- sentinel venture_id, within 0.5s of its creation; the test's own cleanup cancelled+deleted the row 2s later and sd-start.js crashed on the vanished row) AND documented production residue on the same incident class (tests/helpers/credential-fence.js:12-17: one of 11 residual fc000000--sentinel rows, SD-LEO-FIX-REMEDIATION-UNIT-TEST-006, survived non-terminal on the live self-claimable belt). Measured directly: both SD-LEO-FIX-REMEDIATION-UNIT-TEST-006 and SD-LEO-FIX-REMEDIATION-LINT-MEDIUM-005 classify as ['unactionable_venture_remediation'] under the real classifier and are ADMITTED by the new cascade fence (CLAIM_WRITE_FENCE_AXES does not contain this axis).

CORRECTED recommended fix shape (final, superseding the prior amendment's four-axis list): CASCADE_FENCE_AXES = CLAIM_WRITE_FENCE_AXES union {one_way_door_requires_supervision, co_author_pending, test_fixture_key, unactionable_venture_remediation, test_clone_build_tree} -- five axes, not four; test_clone_build_tree carried over from the original review's INFO-1 list without independent re-verification of its own evidence (flagging this explicitly so the eventual follow-up checks it rather than inheriting it uncritically, the same mistake this amendment chain is correcting for the other two).

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
