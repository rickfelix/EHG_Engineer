// Amends feedback row 18485659-4f39-4c74-bad0-f813b266a0e8 (S5 finding from
// SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001's EXEC-phase SECURITY review).
//
// security-exec-cascade-isolation independently re-verified my original claim ("could not
// confirm independent enforcement of one_way_door/co_author_pending") and found it wrong:
// they ARE enforced, at 7 call sites using the idiom `if (classifyDispatchIneligibility(row))
// reject` -- a name-blind blanket check that a name-based grep (what I originally ran) cannot
// see. I independently confirmed 3 of the 7 cited sites directly before amending this record.
//
// Prepending the correction (not deleting the original) per this session's own established
// discipline: lead with the correction, preserve provenance, never silently rewrite history.

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

const correction = `CORRECTION (2026-08-16T17:44Z, via security-exec-cascade-isolation, independently re-verified before recording -- I confirmed lib/fleet/claim-eligibility.cjs:582-586 and scripts/worker-checkin.cjs:960/:1034 directly): the premise below is WRONG and superseded. one_way_door_requires_supervision and co_author_pending ARE enforced -- at classifyDispatchIneligibility() call sites using the idiom "if (classifyDispatchIneligibility(row, ctx)) reject" (reject on ANY non-null reason, not by matching a specific axis name). Confirmed directly at lib/fleet/claim-eligibility.cjs:582-586, scripts/worker-checkin.cjs:960, scripts/worker-checkin.cjs:1034; also cited by security-exec (not independently re-checked by me): stale-session-sweep.cjs:3265, belt-depth.cjs:149, merged-pool-self-claim.cjs:224, claimable-leaves.mjs:57. This idiom never references "door_class_note" or "one_way" literally, which is why the original name-based grep below found nothing while enforcement was real the whole time.

SHARPENED CONCLUSION: the full-classifier (classifyDispatchIneligibility, first-match) consumers enforce these axes broadly (belt self-claim, worker-checkin resume paths, stale-session sweep); the CLAIM_WRITE_FENCE_AXES-subset consumers (the narrower claim-WRITE-boundary re-check, including this SD's 4 cascade pickers) do NOT. The cascade path is a genuine, narrow, cascade-specific outlier -- NOT a cross-cutting sd-start.js/22-consumer gap as originally framed below.

RECOMMENDED FIX SHAPE (per security-exec): do NOT widen the shared CLAIM_WRITE_FENCE_AXES constant (22 consumers, would change the claim-write boundary everywhere). Instead define a cascade-scoped superset -- e.g. CASCADE_FENCE_AXES = CLAIM_WRITE_FENCE_AXES union {one_way_door_requires_supervision, co_author_pending} -- used only by the 4 cascade pickers this SD touched (scripts/modules/handoff/queue-selector.js, orchestrator-completion-hook.js, child-sd-selector.js x2: getNextReadyChild + getReadyChildren).

Still NOT blocking -- security-exec confirmed the original proportionality call to defer was correct ("your proportionality call was right on both [S5 and S6]"). This is a record-accuracy + fix-shape correction for whoever picks up the follow-up, not an escalation.

--- ORIGINAL TEXT (preserved for provenance) ---
${row.description}`;

const { error: updateErr } = await supabase
  .from('feedback')
  .update({ description: correction })
  .eq('id', FEEDBACK_ID);

if (updateErr) {
  console.error('UPDATE_ERROR', updateErr.message);
  process.exit(1);
}

console.log('AMENDED', FEEDBACK_ID);
