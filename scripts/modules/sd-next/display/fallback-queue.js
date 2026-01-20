/**
 * Fallback Queue Display for SD-Next
 * Part of SD-LEO-REFACTOR-SD-NEXT-001
 */

import { colors } from '../colors.js';
import { checkDependenciesResolved } from '../dependency-resolver.js';
import { displayTrackSection } from './tracks.js';

/**
 * Show fallback queue when no baseline is active
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} options - Display options
 */
export async function showFallbackQueue(supabase, options = {}) {
  const { skipBaselineWarning = false, sessionContext = {} } = options;

  // No baseline - fall back to sequence_rank on SDs directly
  const { data: sds, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, legacy_id, title, priority, status, sequence_rank, progress_percentage, dependencies, metadata, is_working_on, parent_sd_id')
    .eq('is_active', true)
    .in('status', ['draft', 'lead_review', 'plan_active', 'exec_active', 'active', 'in_progress'])
    .in('priority', ['critical', 'high', 'medium'])
    .order('sequence_rank', { nullsFirst: false })
    .limit(15);

  if (error || !sds || sds.length === 0) {
    console.log(`${colors.red}No prioritized SDs found. Run: npm run sd:baseline to create one.${colors.reset}`);
    return;
  }

  // Group by track from metadata
  const tracks = { A: [], B: [], C: [], STANDALONE: [], UNASSIGNED: [] };

  for (const sd of sds) {
    const track = sd.metadata?.execution_track || 'UNASSIGNED';
    const trackKey = track === 'Infrastructure' || track === 'Safety' ? 'A' :
                     track === 'Feature' ? 'B' :
                     track === 'Quality' ? 'C' :
                     track === 'STANDALONE' ? 'STANDALONE' : 'UNASSIGNED';

    const depsResolved = await checkDependenciesResolved(supabase, sd.dependencies);

    tracks[trackKey].push({
      ...sd,
      deps_resolved: depsResolved,
      track: trackKey
    });
  }

  // Display tracks
  displayTrackSection('A', 'Infrastructure/Safety', tracks.A, sessionContext);
  displayTrackSection('B', 'Feature/Stages', tracks.B, sessionContext);
  displayTrackSection('C', 'Quality', tracks.C, sessionContext);
  if (tracks.STANDALONE.length > 0) {
    displayTrackSection('STANDALONE', 'Standalone (No Dependencies)', tracks.STANDALONE, sessionContext);
  }
  if (tracks.UNASSIGNED.length > 0) {
    displayTrackSection('UNASSIGNED', 'Unassigned (Needs Track)', tracks.UNASSIGNED, sessionContext);
  }

  // Find ready SDs (include unassigned)
  const readySDs = [];
  for (const sd of sds) {
    const depsResolved = await checkDependenciesResolved(supabase, sd.dependencies);
    if (depsResolved) {
      readySDs.push(sd);
    }
  }

  console.log(`\n${colors.bold}${colors.green}RECOMMENDED STARTING POINTS:${colors.reset}`);

  if (sds.find(s => s.is_working_on)) {
    const workingOn = sds.find(s => s.is_working_on);
    console.log(`${colors.bgYellow}${colors.bold} CONTINUE ${colors.reset} ${workingOn.legacy_id} - ${workingOn.title}`);
    console.log(`${colors.dim}   (Marked as "Working On" in UI)${colors.reset}`);
  }

  // Show top ready SD per track (including unassigned)
  for (const [trackKey, trackSDs] of Object.entries(tracks)) {
    const ready = trackSDs.find(s => s.deps_resolved && !s.is_working_on);
    if (ready) {
      const trackLabel = trackKey === 'UNASSIGNED' ? 'Unassigned' : `Track ${trackKey}`;
      console.log(`${colors.green}  ${trackLabel}:${colors.reset} ${ready.legacy_id} - ${ready.title.substring(0, 50)}...`);
    }
  }

  console.log(`\n${colors.dim}To begin: "I'm working on <SD-ID>"${colors.reset}`);

  // Baseline creation prompt (skip if we already showed exhausted baseline message)
  if (!skipBaselineWarning) {
    displayNoBaselineWarning();
  }
}

/**
 * Show message when baseline exists but all items are completed
 *
 * @param {Object} baseline - The baseline object
 * @param {Array} baselineItems - The baseline items
 */
export function showExhaustedBaselineMessage(baseline, baselineItems) {
  const completedCount = baselineItems.length;

  console.log(`${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.green}${colors.bold}✓ BASELINE COMPLETE${colors.reset}\n`);
  console.log(`  All ${completedCount} SDs in the current baseline are completed!`);
  console.log(`  ${colors.dim}Baseline ID: ${baseline.id.substring(0, 8)}...${colors.reset}\n`);

  console.log(`${colors.cyan}OPTIONS:${colors.reset}`);
  console.log(`  1. ${colors.bold}Continue with available SDs${colors.reset} (shown below)`);
  console.log(`  2. ${colors.bold}Create new baseline:${colors.reset} npm run sd:baseline`);
  console.log(`  3. ${colors.bold}Deactivate old baseline:${colors.reset} npm run sd:baseline:deactivate\n`);

  // Show completed baseline items summary
  console.log(`${colors.dim}Completed baseline items:${colors.reset}`);
  for (const item of baselineItems.slice(0, 5)) {
    console.log(`${colors.dim}  ✓ ${item.sd_id}${colors.reset}`);
  }
  if (baselineItems.length > 5) {
    console.log(`${colors.dim}  ... and ${baselineItems.length - 5} more${colors.reset}`);
  }
  console.log();
}

/**
 * Display warning when no baseline is active
 */
function displayNoBaselineWarning() {
  console.log(`\n${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.yellow}${colors.bold}⚠️  NO ACTIVE BASELINE${colors.reset}`);
  console.log(`${colors.dim}A baseline captures your execution plan with sequence and track assignments.${colors.reset}`);
  console.log(`${colors.dim}Without one, SDs are ordered by sequence_rank only.${colors.reset}\n`);
  console.log(`${colors.cyan}To create a baseline:${colors.reset}`);
  console.log(`  ${colors.bold}npm run sd:baseline${colors.reset}        ${colors.dim}Create execution baseline${colors.reset}`);
  console.log(`  ${colors.bold}npm run sd:baseline view${colors.reset}   ${colors.dim}View current baseline${colors.reset}`);
}
