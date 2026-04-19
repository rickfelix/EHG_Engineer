/**
 * S17 Archetype Generation Auto-Resume
 *
 * Scans for ventures with incomplete archetype generation on server startup
 * and queues sequential resume for each. Uses venture_artifacts as the
 * checkpoint — no new tables needed.
 *
 * SD-MAN-REFAC-S17-SIMPLIFY-PIPELINE-001: Updated for wireframe_screens path.
 * @module lib/eva/stage-17/auto-resume
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Find ventures with missing or partial S17 archetype coverage and resume generation.
 * A venture is "incomplete" if it has a wireframe_screens artifact with N screens
 * but fewer than N s17_archetypes artifacts.
 */
export async function resumeIncompleteArchetypeJobs() {
  // Find ventures at S17 with wireframe_screens artifacts
  const { data: wireframes } = await supabase
    .from('venture_artifacts')
    .select('venture_id, artifact_data')
    .eq('artifact_type', 'wireframe_screens')
    .eq('is_current', true);

  if (!wireframes?.length) {
    console.log('[auto-resume] No wireframe_screens found — nothing to resume');
    return;
  }

  const incompleteJobs = [];

  for (const wf of wireframes) {
    const totalScreens = wf.artifact_data?.screens?.length ?? 0;
    if (totalScreens === 0) continue;

    // Count completed S17 archetypes for this venture
    const { count } = await supabase
      .from('venture_artifacts')
      .select('id', { count: 'exact', head: true })
      .eq('venture_id', wf.venture_id)
      .eq('artifact_type', 's17_archetypes')
      .eq('lifecycle_stage', 17)
      .eq('is_current', true);

    // Detect both zero-archetype AND partial-archetype ventures
    if ((count ?? 0) < totalScreens) {
      incompleteJobs.push({
        ventureId: wf.venture_id,
        completed: count ?? 0,
        total: totalScreens,
      });
    }
  }

  if (incompleteJobs.length === 0) {
    console.log('[auto-resume] No incomplete S17 jobs found');
    return;
  }

  console.log(`[auto-resume] Found ${incompleteJobs.length} incomplete S17 job(s):`);
  for (const job of incompleteJobs) {
    console.log(`  ${job.ventureId}: ${job.completed}/${job.total} screens`);
  }

  const { generateArchetypes } = await import('./archetype-generator.js');

  for (const job of incompleteJobs) {
    console.log(`[auto-resume] Resuming ${job.ventureId} (${job.completed}/${job.total})...`);
    try {
      const result = await generateArchetypes(job.ventureId, supabase);
      console.log(`[auto-resume] Completed ${job.ventureId}: ${result.screenCount} screens, ${result.artifactIds.length} new artifacts`);
    } catch (err) {
      console.error(`[auto-resume] Resume error for ${job.ventureId}:`, err.message);
    }
  }
}
