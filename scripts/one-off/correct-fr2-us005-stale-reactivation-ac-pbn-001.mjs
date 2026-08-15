// Corrects FR-2's acceptance_criteria (item 4/5) and US-005's story acceptance_criteria.
// Both were written against the PRD's ORIGINAL FR-2(iv)/(v) phrasing ("verdict persists ON
// the nursery row" / "reactivating... updates pbn_verdict... on the row") — phrasing TR-8
// explicitly says it SUPERSEDES ("superseding the informal 'verdict persists ON the nursery
// row' phrasing in FR-2(iv)/TR-1"). Found during US-005 acceptance-criteria verification by
// reading reactivateVenture()'s actual body (venture-nursery.js:163-224): it updates only
// last_evaluated_at + source_ref.reactivation, never pbn_verdict. The real design (TR-8b/c/d,
// confirmed by chairman-review.test.js:1032 and pbn-gate-flow.test.js:151): a reactivated
// brief's re-check happens at its NEXT persistVentureBrief() call, not synchronously inside
// reactivateVenture(); a PASS never touches the old nursery row (writes to the NEW venture's
// metadata instead); a REJECT/TRIM creates a BRAND NEW venture_nursery row via parkVenture()
// rather than updating the old one. The old row's pbn_verdict is therefore never overwritten
// at all — history survives by construction (immutability), not by update-with-preservation
// logic as the stale AC implied.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID = 'de5377a7-fa39-486e-ac39-2fa3b0383232';

const { data: prd, error: fetchErr } = await supabase
  .from('product_requirements_v2')
  .select('id, functional_requirements')
  .eq('directive_id', SD_ID)
  .maybeSingle();
if (fetchErr) throw fetchErr;
if (!prd) throw new Error('PRD not found');

const frArr = Array.isArray(prd.functional_requirements)
  ? prd.functional_requirements
  : JSON.parse(prd.functional_requirements);

const fr2 = frArr.find((f) => (f.id || f.key || '') === 'FR-2');
if (!fr2) throw new Error('FR-2 not found');

fr2.acceptance_criteria[3] =
  "CORRECTED (TR-8, after direct code trace of reactivateVenture() found it never touches pbn_verdict): reactivating a parked nursery row does NOT rewrite that row's pbn_verdict in place — reactivateVenture() only stamps source_ref.reactivation + last_evaluated_at. The PBN re-check instead runs at the reactivated brief's NEXT persistVentureBrief() call (TR-8a: 'PBN scoring runs on EVERY brief review'), and writes to one of two DIFFERENT destinations depending on outcome: a PASS writes to the new venture's metadata.stage_zero.pbn_verdict (TR-8d), a REJECT/TRIM writes pbn_verdict onto a BRAND NEW venture_nursery row via parkVenture() (TR-8c) — the original row's pbn_verdict column is never updated by any code path. A test confirms the original row's pbn_verdict.measured_at is unchanged after a second scoring attempt on the same idea (pbn-gate-flow.test.js:151, 173)";
fr2.acceptance_criteria[4] =
  "CORRECTED (same TR-8 finding — 'overwritten' does not occur, so this is reframed from preservation-despite-overwrite to preservation-by-construction): every PBN verdict transition (initial score, and each later re-score after reactivation) produces its OWN nursery_evaluation_log row via recordNurseryEvaluation(), keyed to whichever nurseryId was live at that call (the original row on first score, a new row on a REJECT/TRIM re-score, or the reactivated row's id on a PASS re-score). Because pbn_verdict itself is never updated in place, no re-check can ever destroy a prior verdict's history — confirmed by pbn-gate-flow.test.js:151 (two independent nursery rows + two independent log rows from two scoring attempts, first row's pbn_verdict provably untouched by the second) and chairman-review.test.js:1032 (a PASS on a reactivated brief still logs against the original nurseryId)";

const { error: updateErr } = await supabase
  .from('product_requirements_v2')
  .update({ functional_requirements: frArr })
  .eq('id', prd.id);
if (updateErr) throw updateErr;
console.log('FR-2 acceptance_criteria[3] and [4] corrected.');

const acceptance_criteria = [
  "GIVEN a parked nursery row carrying a pbn_verdict with measured_at = T0 WHEN that idea's brief is reactivated and later re-reviewed via persistVentureBrief() THEN the ORIGINAL row's pbn_verdict.measured_at remains exactly T0 — reactivateVenture() itself never touches pbn_verdict (verified: venture-nursery.js:163-224, no pbn_verdict field in its .update() payload); the re-check's fresh measured_at lands on a DIFFERENT destination per TR-8c/d (a new nursery row on REJECT/TRIM, or the new venture's metadata on PASS), never on the reactivated row in place",
  "GIVEN the re-check runs at the next persistVentureBrief() call WHEN the new verdict is written THEN it is a full re-score — proven/better/new buckets and rule_trace are recomputed via a fresh runPbnGate() call, not a measured_at field bumped on the old object (pbn-gate-flow.test.js:151 uses two distinct mockResolvedValueOnce verdicts across two calls, proving each is an independent scoring pass)",
  "GIVEN the original verdict was REJECT and the re-check yields REJECT again (simulating an unresolved reactivation) WHEN nursery_evaluation_log is queried for both nursery_ids THEN both entries exist independently and the original row's pbn_verdict is unchanged — proven directly by pbn-gate-flow.test.js:151 ('TS-7: each scoring attempt is independently recorded... earlier entries are never lost'): 2 nursery rows, 2 log rows, nurseryRows[0].pbn_verdict.measured_at asserted unchanged",
  "GIVEN reactivateVenture already throws on an already-reactivated or already-promoted row (venture-nursery.js:181-182) WHEN a re-check is later attempted via persistVentureBrief THEN those guards are untouched by this SD — this SD adds no new call from reactivateVenture into the PBN gate, so reactivateVenture's existing guard behavior is unmodified by construction, not merely re-tested",
  "GIVEN a PASS verdict on a REACTIVATED brief (brief.nursery_id set) WHEN persistVentureBrief resolves to 'ready' THEN recordPbnEvaluation is called with that ORIGINAL nurseryId (chairman-review.test.js:1032), so the audit trail links the reactivated row to its resolution even though pbn_verdict itself was written to the new venture's metadata, not back onto the nursery row",
];

const { data: story, error: storyErr } = await supabase
  .from('user_stories')
  .update({ acceptance_criteria })
  .eq('story_key', 'SD-LEO-FEAT-PROVEN-BETTER-NEW-001:US-005')
  .select('story_key, acceptance_criteria')
  .maybeSingle();
if (storyErr) throw storyErr;
console.log('US-005 acceptance_criteria corrected:', story.story_key, '-', story.acceptance_criteria.length, 'criteria');
