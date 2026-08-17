#!/usr/bin/env node
/**
 * One-off: add explicit FR-id references to 4 user_stories for
 * SD-FDBK-FIX-WORKER-ENGAGEMENT-RATIO-001, closing a genuine traceability gap the
 * LEAD-FINAL-APPROVAL FR_DELIVERY_VERIFICATION gate (CONST-012) found.
 *
 * WHY: classifyFrDelivery() (scripts/modules/handoff/gates/fr-delivery-classifier.js) requires
 * a validated story's title/user_want/acceptance_criteria/technical_notes to literally contain
 * the FR's id (word-boundary regex) before counting it as delivered. Diagnostic replay of the
 * exact matcher against the live data confirmed FR-2 and FR-3 are already referenced (both
 * incidentally, inside story d79bcd39's technical_notes.original_criterion prose) but FR-1,
 * FR-4, FR-5, FR-6, FR-7 have ZERO matching stories anywhere -- a real gap, not a detector bug:
 * six stories cover seven FRs thematically, but only one story happens to cite two of them by
 * literal id. All 5 gaps map to code that genuinely exists (verified against the actual shipped
 * files, not asserted): FR-1/FR-7 -> scripts/lib/engagement-buckets.mjs (whose own file header
 * already says "STANDALONE MODULE, DELIBERATELY (FR-7)"), FR-4 -> the belt_capacity_verdicts
 * persistence in coordinator-capacity-forecast.mjs, FR-5 -> the KPI-1 wiring in
 * adam-coordinator-health.mjs, FR-6 -> engagementGaugeOn()/ENGAGEMENT_GAUGE_ENABLED.
 *
 * Adds a `delivers_frs` array to each story's existing technical_notes JSONB object (merge, not
 * overwrite -- the original_criterion/generated_by/gaps_detected content is preserved verbatim).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_ID = '5877fd86-3dc2-470f-b14d-8190ca5436e1';

const ASSIGNMENTS = [
  {
    storyId: 'd79bcd39-dcfb-4cdf-a268-cb04a8b0ceb0',
    title: 'Accurately Classify Worker Engagement into Defined Buckets',
    add: ['FR-1', 'FR-7'],
    why: 'Delivered by scripts/lib/engagement-buckets.mjs: isEngagementBasePopulationMember + classifySessionBucket/classifyEngagementBuckets (FR-1, the single dedicated base-population predicate + populationExtent label) living in its own standalone module (FR-7, already named in the file\'s own header comment).',
  },
  {
    storyId: '060501f2-38b1-4242-9a75-45b2d3bee784',
    title: 'Ensure Robust Persistence of Engagement Verdicts',
    add: ['FR-4'],
    why: 'Delivered by scripts/coordinator-capacity-forecast.mjs persisting engagement_engaged/tail/zombie/idle/unknown/population/population_extent/unmeasured into belt_capacity_verdicts.detail, fail-soft via classifyEngagementBuckets\' own try/catch.',
  },
  {
    storyId: 'f4cd9c83-fb72-4ab1-ba6e-add76e1cd61e',
    title: 'Safeguard KPI Persistence from Engagement Computation Errors',
    add: ['FR-5'],
    why: 'Delivered by scripts/adam-coordinator-health.mjs wiring engagement into computeUtilization()\'s KPI-1 reading via the onRawRows callback, with its own try/catch so a throw there cannot regress the pre-existing KPI-0/1/2/3 fields (pinned by the TS-6 regression test).',
  },
  {
    storyId: 'abc7fb7e-67b5-4d40-93c5-d91b52ae9da0',
    title: 'Enable Feature Flag for Worker Engagement Gauge',
    add: ['FR-6'],
    why: 'Delivered by engagementGaugeOn() reading ENGAGEMENT_GAUGE_ENABLED, defaulting ON unless explicitly \'false\'/\'0\'.',
  },
];

async function main() {
  const s = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  for (const a of ASSIGNMENTS) {
    const { data: story, error: readErr } = await s.from('user_stories')
      .select('id, sd_id, title, technical_notes')
      .eq('id', a.storyId)
      .single();
    if (readErr) { console.error(`Read failed for ${a.storyId}:`, readErr.message); process.exit(1); }
    if (story.sd_id !== SD_ID) {
      console.error(`Story ${a.storyId} belongs to sd_id=${story.sd_id}, not ${SD_ID} — refusing.`);
      process.exit(1);
    }
    if (story.title !== a.title) {
      console.error(`Story ${a.storyId} title mismatch: expected "${a.title}", got "${story.title}" — refusing.`);
      process.exit(1);
    }

    const notes = typeof story.technical_notes === 'object' && story.technical_notes !== null
      ? story.technical_notes
      : {};
    const updatedNotes = { ...notes, delivers_frs: a.add, delivers_frs_rationale: a.why };

    const { error: writeErr } = await s.from('user_stories')
      .update({ technical_notes: updatedNotes })
      .eq('id', a.storyId);
    if (writeErr) { console.error(`Write failed for ${a.storyId}:`, writeErr.message); process.exit(1); }

    console.log(`Updated ${a.storyId} (${a.title}) -> delivers_frs: ${a.add.join(', ')}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
