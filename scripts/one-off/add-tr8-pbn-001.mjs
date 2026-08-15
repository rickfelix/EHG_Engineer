// Adds TR-8 to PRD-SD-LEO-FEAT-PROVEN-BETTER-NEW-001: resolves a real ambiguity found at
// EXEC start (CLAUDE_EXEC.md's mandatory Tier-2 ambiguity resolution) by directly reading
// chairman-review.js and venture-nursery.js before writing integration code.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-FEAT-PROVEN-BETTER-NEW-001';

const { data: current, error: fetchErr } = await supabase.from('product_requirements_v2')
  .select('technical_requirements').eq('id', PRD_ID).maybeSingle();
if (fetchErr) throw fetchErr;

const technical_requirements = [
  ...current.technical_requirements,
  {
    id: 'TR-8',
    requirement: "AMBIGUITY RESOLUTION (EXEC Tier-2, direct code read): conductChairmanReview() operates on a `brief`, which does NOT necessarily correspond to an existing venture_nursery row -- brief.nursery_id is only set on the reactivateVenture() path; a first-time brief can go straight to 'ready'/'seed'/'sprout' without ever touching nursery. Resolved persistence design, superseding the informal 'verdict persists ON the nursery row' phrasing in FR-2(iv)/TR-1: (a) PBN scoring runs on EVERY brief review, before the decision is finalized. (b) If verdict is REJECT or TRIM, decision is FORCED to 'park', overriding whatever maturity originally computed -- the idea never reaches the ventures table. (c) When decision resolves to 'park' (whether originally park, or PBN-forced), pbn_verdict is passed through parkVenture()'s params (parkVenture extended to accept params.pbnVerdict) and written onto the newly-created venture_nursery row; recordNurseryEvaluation() (TR-5) is then called using THAT row's real id as nurseryId, since recordNurseryEvaluation requires a non-null nurseryId and none exists before the park insert completes. (d) When decision resolves to 'ready'/'seed'/'sprout' (only reachable when PBN verdict is PASS, since REJECT/TRIM always forces park), pbn_verdict is instead recorded in venture.metadata.stage_zero.pbn_verdict on the ventures-table insert already being built in persistVentureBrief() -- no nursery row is created solely to hold a verdict for an idea that was never actually parked.",
    rationale: "venture_nursery.pbn_verdict (TR-1) is therefore populated ONLY on the park outcome; the ready outcome's verdict lives in the venture's own metadata instead, reusing the metadata.stage_zero object structure persistVentureBrief() already builds for that insert -- no new column, no new store, consistent with FR-4. This was not visible from the PRD's FR/TR text alone (written at PLAN before the exact call graph was re-verified at EXEC start) and required tracing brief.nursery_id's origin through reactivateVenture()'s pathOutput to confirm it is genuinely optional, not always present.",
  },
];

const { data: updated, error: updateErr } = await supabase.from('product_requirements_v2')
  .update({ technical_requirements }).eq('id', PRD_ID).select('technical_requirements').maybeSingle();
if (updateErr) throw updateErr;
console.log('TR-8 added. Total TRs:', updated.technical_requirements.length);
