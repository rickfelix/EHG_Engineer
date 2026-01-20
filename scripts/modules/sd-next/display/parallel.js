/**
 * Parallel Opportunities Display for SD-Next
 * Part of SD-LEO-REFACTOR-SD-NEXT-001
 */

import { colors } from '../colors.js';

/**
 * Display parallel opportunities for multi-session work
 *
 * @param {Object|null} sessionManager - Session manager instance
 * @param {Object|null} currentSession - Current session
 */
export async function displayParallelOpportunities(sessionManager, currentSession) {
  if (!sessionManager) return;

  try {
    const trackStatus = await sessionManager.getParallelTrackStatus();

    // Find tracks without active sessions that have available work
    const openTracks = trackStatus.filter(t =>
      t.track_status === 'open' && t.available_sds > 0
    );

    // If current session has no SD claimed, suggest claiming one
    if (currentSession && !currentSession.sd_id) {
      const readyTracks = trackStatus.filter(t => t.available_sds > 0);
      if (readyTracks.length > 0) {
        displayClaimSuggestion();
      }
    }

    // If there are open tracks and current session already has a claim, suggest parallel
    if (openTracks.length > 0 && currentSession?.sd_id) {
      displayOpenTracksForParallel(openTracks);
    }

    // If all tracks are occupied, show status
    const occupiedTracks = trackStatus.filter(t => t.track_status === 'occupied');
    if (occupiedTracks.length === trackStatus.length && trackStatus.length > 0) {
      displayAllTracksOccupied();
    }

  } catch {
    // Non-fatal - just skip parallel suggestions
  }
}

/**
 * Display suggestion to claim an SD
 */
function displayClaimSuggestion() {
  console.log(`\n${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}CLAIM AN SD:${colors.reset}\n`);
  console.log(`${colors.dim}This session has no SD claimed. To claim:${colors.reset}`);
  console.log(`  ${colors.cyan}npm run sd:claim <SD-ID>${colors.reset}  - Claim a specific SD`);
  console.log(`  ${colors.dim}Or tell me: "I want to work on <SD-ID>"${colors.reset}\n`);
}

/**
 * Display open tracks available for parallel work
 *
 * @param {Array} openTracks - Open tracks with available SDs
 */
function displayOpenTracksForParallel(openTracks) {
  console.log(`\n${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.bold}${colors.green}PARALLEL OPPORTUNITY:${colors.reset}\n`);
  console.log(`  ${colors.dim}Open another terminal for parallel work:${colors.reset}\n`);

  for (const track of openTracks) {
    const trackColor = track.track === 'A' ? colors.magenta :
                      track.track === 'B' ? colors.blue :
                      track.track === 'C' ? colors.cyan : colors.yellow;

    console.log(`  ${trackColor}${colors.bold}Track ${track.track}${colors.reset} (${track.track_name})`);
    console.log(`    Next: ${colors.bold}${track.next_available_sd}${colors.reset}`);
    console.log(`    Available: ${track.available_sds} SDs`);
  }

  console.log(`\n  ${colors.dim}Run ${colors.cyan}npm run sd:next${colors.dim} in new terminal, then:${colors.reset}`);
  console.log(`  ${colors.cyan}npm run sd:claim <SD-ID>${colors.reset}`);
}

/**
 * Display message when all tracks are occupied
 */
function displayAllTracksOccupied() {
  console.log(`\n${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.bold}${colors.yellow}ALL TRACKS ACTIVE:${colors.reset}\n`);
  console.log(`  ${colors.dim}All parallel tracks have active sessions.${colors.reset}`);
  console.log(`  ${colors.dim}Wait for a session to complete or release its SD.${colors.reset}`);
}
