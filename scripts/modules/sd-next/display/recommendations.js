/**
 * Recommendations Display for SD-Next
 * Part of SD-LEO-REFACTOR-SD-NEXT-001
 */

import { colors } from '../colors.js';
import { isActionableForLead } from '../status-helpers.js';
import { checkDependenciesResolved } from '../dependency-resolver.js';
import { getEstimatedDuration, formatEstimateShort } from '../../../lib/duration-estimator.js';

/**
 * Display recommendations section
 *
 * @param {Object} supabase - Supabase client
 * @param {Array} baselineItems - Baseline items
 * @param {Array} conflicts - Active conflicts
 */
export async function displayRecommendations(supabase, baselineItems, conflicts = []) {
  console.log(`\n${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.bold}${colors.green}RECOMMENDED ACTIONS:${colors.reset}\n`);

  // Check for "working on" SD first
  const workingOn = await getWorkingOnSD(supabase);

  if (workingOn) {
    await displayWorkingOnSD(supabase, workingOn);
  }

  // Find ready SDs from baseline
  const { readySDs, needsVerificationSDs } = await categorizeBaselineSDs(supabase, baselineItems);

  // Show SDs needing verification/close-out FIRST (Control Gap Fix)
  if (needsVerificationSDs.length > 0) {
    displayVerificationNeeded(needsVerificationSDs);
  }

  if (readySDs.length > 0 && !workingOn) {
    await displayStartRecommendation(supabase, readySDs[0]);
  }

  // Show parallel opportunities
  const parallelReady = readySDs.filter(sd => sd.track !== readySDs[0]?.track).slice(0, 2);
  if (parallelReady.length > 0) {
    displayParallelOpportunities(parallelReady);
  }

  // Show conflicts if any
  if (conflicts.length > 0) {
    displayConflictWarnings(conflicts);
  }

  // Show how to begin work
  displayBeginWorkInstructions();
}

/**
 * Get SD marked as "working on"
 */
async function getWorkingOnSD(supabase) {
  const { data: workingOn } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, progress_percentage')
    .eq('is_active', true)
    .eq('is_working_on', true)
    .lt('progress_percentage', 100)
    .single();

  return workingOn;
}

/**
 * Display "working on" SD with duration estimate
 */
async function displayWorkingOnSD(supabase, workingOn) {
  const sdId = workingOn.sd_key || workingOn.id;
  console.log(`${colors.bgYellow}${colors.bold} CONTINUE ${colors.reset} ${sdId}`);
  console.log(`  ${workingOn.title}`);
  console.log(`  ${colors.dim}Progress: ${workingOn.progress_percentage || 0}% | Marked as "Working On"${colors.reset}`);

  // Add duration estimate
  try {
    const { data: sdFull } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_type, category, priority')
      .or(`sd_key.eq.${sdId},id.eq.${workingOn.id}`)
      .single();

    if (sdFull) {
      const estimate = await getEstimatedDuration(supabase, sdFull);
      console.log(`  ${colors.dim}Est: ${formatEstimateShort(estimate)}${colors.reset}\n`);
    } else {
      console.log();
    }
  } catch {
    console.log();
  }
}

/**
 * Categorize baseline SDs into ready and needs verification
 */
async function categorizeBaselineSDs(supabase, baselineItems) {
  const readySDs = [];
  const needsVerificationSDs = [];

  for (const item of baselineItems) {
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, current_phase, progress_percentage, dependencies, is_active')
      .or(`sd_key.eq.${item.sd_id},id.eq.${item.sd_id}`)
      .single();

    if (sd && sd.is_active && sd.status !== 'completed' && sd.status !== 'cancelled') {
      const depsResolved = await checkDependenciesResolved(supabase, sd.dependencies);
      const enrichedSD = { ...item, ...sd, deps_resolved: depsResolved };

      // Separate SDs needing verification from truly ready SDs
      if (sd.current_phase === 'EXEC_COMPLETE' || sd.status === 'review') {
        needsVerificationSDs.push(enrichedSD);
      } else if (depsResolved && isActionableForLead(enrichedSD)) {
        readySDs.push(enrichedSD);
      }
    }
  }

  return { readySDs, needsVerificationSDs };
}

/**
 * Display SDs that need verification
 */
function displayVerificationNeeded(needsVerificationSDs) {
  console.log(`${colors.bgMagenta}${colors.bold} NEEDS VERIFICATION ${colors.reset}`);
  needsVerificationSDs.forEach(sd => {
    const sdId = sd.sd_key || sd.id;
    console.log(`  ${sdId} - ${sd.title.substring(0, 45)}...`);
    console.log(`  ${colors.dim}Phase: ${sd.current_phase} | Status: ${sd.status} | Run: npm run sd:verify ${sdId}${colors.reset}\n`);
  });
}

/**
 * Display start recommendation with duration estimate
 */
async function displayStartRecommendation(supabase, topSD) {
  const sdId = topSD.sd_key || topSD.id;
  console.log(`${colors.bgGreen}${colors.bold} START ${colors.reset} ${sdId}`);
  console.log(`  ${topSD.title}`);
  console.log(`  ${colors.dim}Track: ${topSD.track || 'N/A'} | Rank: ${topSD.sequence_rank} | All dependencies satisfied${colors.reset}`);

  // Add duration estimate
  try {
    const { data: sdFull } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_type, category, priority')
      .or(`sd_key.eq.${sdId},id.eq.${topSD.id}`)
      .single();

    if (sdFull) {
      const estimate = await getEstimatedDuration(supabase, sdFull);
      console.log(`  ${colors.dim}Est: ${formatEstimateShort(estimate)}${colors.reset}\n`);
    } else {
      console.log();
    }
  } catch {
    console.log();
  }
}

/**
 * Display parallel opportunities
 */
function displayParallelOpportunities(parallelReady) {
  console.log(`${colors.cyan}PARALLEL OPPORTUNITIES:${colors.reset}`);
  parallelReady.forEach(sd => {
    const sdId = sd.sd_key || sd.id;
    console.log(`  Track ${sd.track}: ${sdId} - ${sd.title.substring(0, 40)}...`);
  });
}

/**
 * Display conflict warnings
 */
function displayConflictWarnings(conflicts) {
  console.log(`\n${colors.red}${colors.bold}CONFLICT WARNINGS:${colors.reset}`);
  conflicts.forEach(c => {
    console.log(`  ${colors.red}!${colors.reset} ${c.sd_id_a} + ${c.sd_id_b}: ${c.conflict_type}`);
  });
}

/**
 * Display instructions for beginning work
 */
function displayBeginWorkInstructions() {
  console.log(`\n${colors.bold}TO BEGIN WORK:${colors.reset}`);
  console.log(`  ${colors.cyan}npm run sd:start <SD-ID>${colors.reset}  ${colors.dim}(recommended - claims SD and shows info)${colors.reset}`);
  console.log(`  ${colors.dim}OR: node scripts/handoff.js execute LEAD-TO-PLAN <SD-ID>${colors.reset}`);
}

/**
 * Display active sessions
 *
 * @param {Array} activeSessions - Active sessions
 * @param {Object|null} currentSession - Current session
 */
export function displayActiveSessions(activeSessions, currentSession) {
  if (activeSessions.length === 0) return;

  const sessionsWithClaims = activeSessions.filter(s => s.sd_id);
  const idleSessions = activeSessions.filter(s => !s.sd_id);

  if (sessionsWithClaims.length > 0) {
    console.log(`${colors.bold}ACTIVE SESSIONS (${sessionsWithClaims.length}):${colors.reset}\n`);

    for (const s of sessionsWithClaims) {
      const isCurrent = currentSession && s.session_id === currentSession.session_id;
      const marker = isCurrent ? `${colors.green}→${colors.reset}` : ' ';
      const shortId = s.session_id.substring(0, 16) + '...';
      const ageMin = Math.round(s.claim_duration_minutes || 0);

      console.log(`${marker} ${shortId} │ ${colors.bold}${s.sd_id}${colors.reset} (Track ${s.track}) │ ${ageMin}m active`);
    }
    console.log();
  }

  if (idleSessions.length > 0 && sessionsWithClaims.length === 0) {
    console.log(`${colors.dim}(${idleSessions.length} idle session(s) detected)${colors.reset}\n`);
  }
}

/**
 * Display session context (recent activity)
 *
 * @param {Array} recentActivity - Recent activity data
 */
export function displaySessionContext(recentActivity) {
  if (recentActivity.length === 0) return;

  console.log(`\n${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.bold}RECENT SESSION ACTIVITY:${colors.reset}\n`);

  recentActivity.slice(0, 3).forEach(activity => {
    const commitInfo = activity.commits > 0 ? `${activity.commits} commits` : 'recently updated';
    console.log(`  ${activity.sd_id} - ${commitInfo}`);
  });

  console.log(`\n${colors.dim}Consider continuing recent work for context preservation.${colors.reset}`);
}
