/**
 * Recommendations Display for SD-Next
 * Part of SD-LEO-REFACTOR-SD-NEXT-001
 */

import { colors } from '../colors.js';
import { isActionableForLead } from '../status-helpers.js';
import { checkDependenciesResolved, checkMetadataDependency, resolveMetadataBlocker } from '../dependency-resolver.js';
import { getEstimatedDuration, formatEstimateShort } from '../../../lib/duration-estimator.js';

/**
 * Display recommendations section and return structured action data.
 *
 * @param {Object} supabase - Supabase client
 * @param {Array} baselineItems - Baseline items
 * @param {Array} conflicts - Active conflicts
 * @returns {{ action: string, sd_id: string|null, reason: string }} Recommended next action
 */
export async function displayRecommendations(supabase, baselineItems, conflicts = [], sessionContext = {}) {
  console.log(`\n${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.bold}${colors.green}RECOMMENDED ACTIONS:${colors.reset}\n`);

  // Check for "working on" SD first (cross-reference with session claims)
  const workingOn = await getWorkingOnSD(supabase, sessionContext);

  if (workingOn) {
    await displayWorkingOnSD(supabase, workingOn, sessionContext);
  }

  // Find ready SDs from baseline (skip SDs claimed by other sessions)
  const { readySDs, needsVerificationSDs, metadataBlockedSDs } = await categorizeBaselineSDs(supabase, baselineItems, sessionContext);

  // Show SDs needing verification/close-out FIRST (Control Gap Fix)
  if (needsVerificationSDs.length > 0) {
    displayVerificationNeeded(needsVerificationSDs);
  }

  // Show UNBLOCK recommendations before START (metadata-blocked SDs)
  let unblockTarget = null;
  if (metadataBlockedSDs.length > 0 && (!workingOn || workingOn._claimedByOther)) {
    unblockTarget = await displayUnblockRecommendations(supabase, metadataBlockedSDs);
  }

  if (readySDs.length > 0 && (!workingOn || workingOn._claimedByOther)) {
    // Check if the top SD is an orchestrator — if so, show its unclaimed children instead
    const topSD = readySDs[0];
    const topSdId = topSD.sd_key || topSD.id;
    const { data: orchChildren } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, current_phase, claiming_session_id, priority')
      .eq('parent_sd_id', topSdId)
      .in('status', ['draft', 'active', 'in_progress']);

    if (orchChildren && orchChildren.length > 0) {
      // This is an orchestrator — show unclaimed children as individual START candidates
      const unclaimed = orchChildren.filter(c => !c.claiming_session_id);
      const claimed = orchChildren.filter(c => c.claiming_session_id);

      console.log(`${colors.bgBlue}${colors.bold} ORCHESTRATOR ${colors.reset} ${topSdId} (${orchChildren.length} children)`);
      console.log(`  ${topSD.title}`);
      if (claimed.length > 0) {
        console.log(`  ${colors.dim}${claimed.length} child(ren) already claimed by other sessions${colors.reset}`);
      }
      console.log();

      if (unclaimed.length > 0) {
        // Show first unclaimed child as the START recommendation
        const firstChild = unclaimed[0];
        await displayStartRecommendation(supabase, { ...firstChild, track: topSD.track, sequence_rank: topSD.sequence_rank });

        // Show additional unclaimed children as parallel opportunities
        if (unclaimed.length > 1) {
          console.log(`${colors.cyan}  Other unclaimed children:${colors.reset}`);
          unclaimed.slice(1, 4).forEach(c => {
            const childId = c.sd_key || c.id;
            console.log(`    ${childId} - ${c.title.substring(0, 50)}${c.title.length > 50 ? '...' : ''}`);
          });
          console.log();
        }
      } else {
        console.log(`  ${colors.yellow}All children are claimed or completed.${colors.reset}\n`);
      }
    } else {
      // Not an orchestrator — display normally
      await displayStartRecommendation(supabase, topSD);
    }
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

  // Return structured action data (PAT-AUTO-PROCEED-002 CAPA)
  // Priority: continue > verify > unblock target > start > none
  if (workingOn && !workingOn._claimedByOther) {
    const sdId = workingOn.sd_key || workingOn.id;
    return { action: 'continue', sd_id: sdId, reason: `SD ${sdId} is marked as working on (${workingOn.progress_percentage || 0}% complete)` };
  }
  if (needsVerificationSDs.length > 0) {
    const sd = needsVerificationSDs[0];
    const sdId = sd.sd_key || sd.id;
    return { action: 'verify', sd_id: sdId, reason: `SD ${sdId} needs verification (phase: ${sd.current_phase})` };
  }
  if (unblockTarget) {
    const sdId = unblockTarget.sd_key || unblockTarget.id;
    return { action: 'start', sd_id: sdId, reason: `SD ${sdId} unblocks a metadata-dependent SD` };
  }
  if (readySDs.length > 0) {
    const sd = readySDs[0];
    const sdId = sd.sd_key || sd.id;

    // If top SD is an orchestrator, return first unclaimed child as the action target
    const { data: actionChildren } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, claiming_session_id, status')
      .eq('parent_sd_id', sdId)
      .in('status', ['draft', 'active', 'in_progress']);

    if (actionChildren && actionChildren.length > 0) {
      const unclaimed = actionChildren.filter(c => !c.claiming_session_id);
      if (unclaimed.length > 0) {
        const childId = unclaimed[0].sd_key || unclaimed[0].id;
        return { action: 'start', sd_id: childId, reason: `Child ${childId} of orchestrator ${sdId} (${unclaimed.length} unclaimed children)` };
      }
      return { action: 'none', sd_id: null, reason: `Orchestrator ${sdId} has no unclaimed children` };
    }

    return { action: 'start', sd_id: sdId, reason: `SD ${sdId} is next in queue (rank: ${sd.sequence_rank}, deps satisfied)` };
  }
  return { action: 'none', sd_id: null, reason: 'No actionable SDs found in queue' };
}

/**
 * Get SD marked as "working on", cross-referenced with session claims
 */
async function getWorkingOnSD(supabase, sessionContext = {}) {
  // SD-LEO-INFRA-CLAIM-GUARD-001: Use claiming_session_id as primary, fall back to is_working_on
  const { data: workingOn } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, progress_percentage, claiming_session_id')
    .eq('is_active', true)
    .or('claiming_session_id.not.is.null,is_working_on.eq.true')
    .lt('progress_percentage', 100)
    .single();

  if (!workingOn) return null;

  // Use claiming_session_id directly (no need to cross-reference session claims map)
  const { currentSession } = sessionContext;
  const currentSessionId = currentSession?.session_id;

  if (workingOn.claiming_session_id && workingOn.claiming_session_id !== currentSessionId) {
    workingOn._claimedByOther = true;
    workingOn._claimingSessionId = workingOn.claiming_session_id;
  }

  return workingOn;
}

/**
 * Display "working on" SD with duration estimate and claim status
 */
async function displayWorkingOnSD(supabase, workingOn, sessionContext = {}) {
  const sdId = workingOn.sd_key || workingOn.id;

  // Show CLAIMED warning if another session owns this SD
  if (workingOn._claimedByOther) {
    const { activeSessions = [] } = sessionContext;
    const claimingSession = activeSessions.find(s => s.session_id === workingOn._claimingSessionId);
    const shortId = (workingOn._claimingSessionId || '').substring(0, 20) + '...';
    const heartbeatAge = claimingSession?.heartbeat_age_human || 'unknown';
    const hostname = claimingSession?.hostname || 'unknown';

    console.log(`${colors.bgRed}${colors.bold} CLAIMED ${colors.reset} ${sdId}`);
    console.log(`  ${workingOn.title}`);
    console.log(`  ${colors.dim}Progress: ${workingOn.progress_percentage || 0}% | Marked as "Working On"${colors.reset}`);
    console.log(`  ${colors.red}Claimed by session ${shortId} (${heartbeatAge}) on ${hostname}${colors.reset}`);
    console.log(`  ${colors.yellow}Pick a different SD or wait for the session to release.${colors.reset}\n`);
    return;
  }

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
async function categorizeBaselineSDs(supabase, baselineItems, sessionContext = {}) {
  const readySDs = [];
  const needsVerificationSDs = [];
  const metadataBlockedSDs = [];
  const { claimedSDs, currentSession } = sessionContext;
  const currentSessionId = currentSession?.session_id;

  for (const item of baselineItems) {
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, current_phase, progress_percentage, dependencies, is_active, metadata, claiming_session_id')
      .or(`sd_key.eq.${item.sd_id},id.eq.${item.sd_id}`)
      .single();

    if (sd && sd.is_active && sd.status !== 'completed' && sd.status !== 'cancelled') {
      // SD-LEO-INFRA-CLAIM-GUARD-001: Skip SDs claimed by OTHER sessions (use claiming_session_id)
      if (sd.claiming_session_id && sd.claiming_session_id !== currentSessionId) {
        continue;
      }

      const depsResolved = await checkDependenciesResolved(supabase, sd.dependencies);
      const enrichedSD = { ...item, ...sd, deps_resolved: depsResolved };

      // Separate SDs needing verification from truly ready SDs
      if (sd.current_phase === 'EXEC_COMPLETE' || sd.status === 'review') {
        needsVerificationSDs.push(enrichedSD);
      } else if (depsResolved && isActionableForLead(enrichedSD)) {
        // Check metadata dependency (soft/conditional)
        const metaDep = checkMetadataDependency(sd.metadata);
        if (metaDep.hasMetadataDep) {
          const blockerInfo = await resolveMetadataBlocker(supabase, metaDep.blockerSdKey);
          if (blockerInfo.isComplete || !blockerInfo.blockerSD) {
            // Blocker satisfied or doesn't exist — treat as ready
            readySDs.push(enrichedSD);
          } else {
            // Blocker incomplete — metadata-blocked
            enrichedSD._metaDep = metaDep;
            enrichedSD._blockerInfo = blockerInfo;
            metadataBlockedSDs.push(enrichedSD);
          }
        } else {
          readySDs.push(enrichedSD);
        }
      }
    }
  }

  return { readySDs, needsVerificationSDs, metadataBlockedSDs };
}

/**
 * Display UNBLOCK recommendations for metadata-blocked SDs
 * Returns the top unblock target SD for AUTO-PROCEED action, or null
 */
async function displayUnblockRecommendations(supabase, metadataBlockedSDs) {
  let topTarget = null;

  for (const sd of metadataBlockedSDs.slice(0, 2)) {
    const { _metaDep, _blockerInfo } = sd;
    const blockerSD = _blockerInfo.blockerSD;
    const blockerKey = blockerSD.sd_key || blockerSD.id;
    const blockedKey = sd.sd_key || sd.id;

    if (_blockerInfo.actionableChildren.length > 0) {
      const target = _blockerInfo.actionableChildren[0];
      const targetKey = target.sd_key || target.id;

      if (!topTarget) topTarget = target;

      console.log(`${colors.bgCyan}${colors.bold} UNBLOCK ${colors.reset} ${targetKey}`);
      console.log(`  ${target.title || blockerSD.title}`);

      // Progress info
      if (_blockerInfo.isLeaf) {
        console.log(`  ${colors.dim}Reason: ${blockedKey} depends on ${blockerKey} (${blockerSD.progress_percentage || 0}% complete)${colors.reset}`);
      } else {
        const remaining = (_blockerInfo.totalChildren || 0) - (_blockerInfo.completedChildren || 0);
        console.log(`  ${colors.dim}Reason: ${blockedKey} depends on ${blockerKey} (${blockerSD.progress_percentage || 0}% complete)${colors.reset}`);
        console.log(`  ${colors.dim}Completing this child advances the blocker (${remaining} remaining children)${colors.reset}`);
      }

      // Conditional note
      if (_metaDep.conditionalNote) {
        console.log(`  ${colors.dim}Condition: ${_metaDep.conditionalNote}${colors.reset}`);
      }

      // Duration estimate + track
      try {
        const { data: targetFull } = await supabase
          .from('strategic_directives_v2')
          .select('id, sd_type, category, priority')
          .eq('sd_key', targetKey)
          .single();

        if (targetFull) {
          const estimate = await getEstimatedDuration(supabase, targetFull);
          console.log(`  ${colors.dim}Track: ${target.track || sd.track || 'N/A'} | Est: ${formatEstimateShort(estimate)}${colors.reset}\n`);
        } else {
          console.log();
        }
      } catch {
        console.log();
      }
    } else {
      // No actionable children — show info-only blocked badge
      console.log(`${colors.bgYellow}${colors.bold} BLOCKED ${colors.reset} ${blockedKey}`);
      console.log(`  ${sd.title}`);
      console.log(`  ${colors.dim}Depends on ${blockerKey} (${blockerSD.progress_percentage || 0}% complete) — no actionable children${colors.reset}`);
      if (_metaDep.conditionalNote) {
        console.log(`  ${colors.dim}Condition: ${_metaDep.conditionalNote}${colors.reset}`);
      }
      console.log();
    }
  }

  return topTarget;
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
 * SD-LEO-INFRA-MULTI-SESSION-COORDINATION-001 (FR-6): Enhanced to show owner details and heartbeat
 *
 * @param {Array} activeSessions - Active sessions (from v_active_sessions view)
 * @param {Object|null} currentSession - Current session
 */
export function displayActiveSessions(activeSessions, currentSession) {
  if (activeSessions.length === 0) return;

  const sessionsWithClaims = activeSessions.filter(s => s.sd_id);
  const idleSessions = activeSessions.filter(s => !s.sd_id);

  if (sessionsWithClaims.length > 0) {
    console.log(`${colors.bold}ACTIVE SESSIONS (${sessionsWithClaims.length}):${colors.reset}\n`);

    // Header row
    console.log(`${colors.dim}   Session           │ Claimed SD                │ Track │ Duration │ Heartbeat${colors.reset}`);
    console.log(`${colors.dim}${'─'.repeat(100)}${colors.reset}`);

    for (const s of sessionsWithClaims) {
      const isCurrent = currentSession && s.session_id === currentSession.session_id;
      const marker = isCurrent ? `${colors.green}→${colors.reset}` : ' ';
      const shortId = s.session_id.substring(0, 16) + '...';
      const ageMin = Math.round(s.claim_duration_minutes || 0);

      // FR-6: Show heartbeat age with color coding
      const heartbeatAgeSeconds = Math.round(s.heartbeat_age_seconds || 0);
      const heartbeatAge = s.heartbeat_age_human || formatHeartbeatAgeDisplay(heartbeatAgeSeconds);

      // Color code heartbeat: green <120s, yellow <600s, red >=600s (approaching 15min stale)
      let heartbeatColor = colors.green;
      if (heartbeatAgeSeconds >= 600) {
        heartbeatColor = colors.red;
      } else if (heartbeatAgeSeconds >= 120) {
        heartbeatColor = colors.yellow;
      }

      const sdDisplay = (s.sd_id || 'None').padEnd(25);
      const trackDisplay = (s.track || 'N/A').padEnd(5);
      const durationDisplay = `${ageMin}m`.padEnd(8);

      console.log(`${marker} ${shortId} │ ${colors.bold}${sdDisplay}${colors.reset} │ ${trackDisplay} │ ${durationDisplay} │ ${heartbeatColor}${heartbeatAge}${colors.reset}`);

      // Show hostname/codebase for non-current sessions (helps identify which terminal)
      if (!isCurrent && (s.hostname || s.codebase)) {
        const hostInfo = [s.hostname, s.codebase].filter(Boolean).join(' / ');
        console.log(`${colors.dim}                       └ ${hostInfo}${colors.reset}`);
      }
    }
    console.log();
  }

  if (idleSessions.length > 0) {
    console.log(`${colors.dim}(${idleSessions.length} idle session(s) - no SD claimed)${colors.reset}\n`);
  }
}

/**
 * Format heartbeat age for display (fallback if view column unavailable)
 * @param {number} seconds - Heartbeat age in seconds
 * @returns {string} - Human-readable age
 */
function formatHeartbeatAgeDisplay(seconds) {
  if (!seconds || seconds < 0) return 'just now';
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
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
