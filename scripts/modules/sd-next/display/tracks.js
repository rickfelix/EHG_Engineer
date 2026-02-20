/**
 * Tracks Display for SD-Next
 * Part of SD-LEO-REFACTOR-SD-NEXT-001
 */

import { colors, trackColors } from '../colors.js';
import { getPhaseAwareStatus } from '../status-helpers.js';
import { parseDependencies } from '../dependency-resolver.js';
import { formatVisionBadge } from './vision-scorecard.js';

/**
 * Display a track section with hierarchical SD items
 *
 * @param {string} trackKey - Track key (A, B, C, STANDALONE, UNASSIGNED)
 * @param {string} trackName - Track display name
 * @param {Array} items - SD items in this track
 * @param {Object} sessionContext - Session context {claimedSDs, currentSession, activeSessions}
 */
export function displayTrackSection(trackKey, trackName, items, sessionContext = {}) {
  if (items.length === 0) return;

  console.log(`\n${trackColors[trackKey]}${colors.bold}TRACK ${trackKey}: ${trackName}${colors.reset}`);

  // Group items by parent for hierarchical display
  const rootItems = [];
  const childItems = new Map(); // parent_sd_id -> children

  for (const item of items) {
    if (item.parent_sd_id) {
      if (!childItems.has(item.parent_sd_id)) {
        childItems.set(item.parent_sd_id, []);
      }
      childItems.get(item.parent_sd_id).push(item);
    } else {
      rootItems.push(item);
    }
  }

  // Also add items whose parent is not in this track as roots
  for (const item of items) {
    if (item.parent_sd_id) {
      const parentInTrack = items.find(i =>
        (i.sd_key || i.sd_id) === item.parent_sd_id || i.id === item.parent_sd_id
      );
      if (!parentInTrack && !rootItems.includes(item)) {
        rootItems.push(item);
      }
    }
  }

  // Display hierarchically
  for (const item of rootItems) {
    displaySDItem(item, '', childItems, items, sessionContext);
  }
}

/**
 * Display a single SD item with its children (recursive)
 *
 * @param {Object} item - SD item to display
 * @param {string} indent - Current indentation
 * @param {Map} childItems - Map of parent_sd_id -> children
 * @param {Array} allItems - All items in the track
 * @param {Object} sessionContext - Session context
 */
function displaySDItem(item, indent, childItems, allItems, sessionContext) {
  const { claimedSDs = new Map(), currentSession = null, activeSessions = [] } = sessionContext;

  const sdId = item.sd_key || item.sd_id;
  const rankStr = item.sequence_rank ? `[${item.sequence_rank}]`.padEnd(5) : '     ';

  // Check if claimed by another session
  const claimedBySession = claimedSDs.get(sdId);
  const isClaimedByOther = claimedBySession &&
    currentSession &&
    claimedBySession !== currentSession.session_id;
  const isClaimedByMe = claimedBySession &&
    currentSession &&
    claimedBySession === currentSession.session_id;

  // Status icon logic - now phase-aware (Control Gap Fix)
  let statusIcon;
  if (isClaimedByOther) {
    statusIcon = `${colors.yellow}CLAIMED${colors.reset}`;
  } else if (isClaimedByMe) {
    statusIcon = `${colors.green}YOURS${colors.reset}`;
  } else {
    // Use phase-aware status to prevent showing READY for SDs needing verification
    statusIcon = getPhaseAwareStatus(item);
  }

  const workingIcon = item.is_working_on ? `${colors.bgYellow} ACTIVE ${colors.reset} ` : '';
  const claimedIcon = isClaimedByOther ? `${colors.bgBlue} CLAIMED ${colors.reset} ` : '';
  const title = (item.title || '').substring(0, 40 - indent.length);
  const visionBadge = formatVisionBadge(item.vision_score ?? item.vision_alignment_score);
  const gapBadge = (item.gap_weight > 0)
    ? ` ${colors.cyan}↑gap:${item.gap_weight.toFixed(2)}${colors.reset}`
    : '';
  // SD-EHG-ORCH-INTELLIGENCE-INTEGRATION-001-A: Urgency band badge
  const urgencyBadgeColors = { P0: colors.red, P1: colors.yellow, P2: colors.cyan, P3: colors.dim };
  const urgencyBadge = item.urgency_band
    ? ` ${urgencyBadgeColors[item.urgency_band] || colors.dim}[${item.urgency_band}]${colors.reset}`
    : '';

  console.log(`${indent}${claimedIcon}${workingIcon}${rankStr} ${sdId} - ${title}${urgencyBadge}${visionBadge}${gapBadge}... ${statusIcon}`);

  // Show who claimed it with enhanced details (FR-6)
  if (isClaimedByOther) {
    const claimingSession = activeSessions.find(s => s.session_id === claimedBySession);
    const shortId = claimedBySession.substring(0, 12) + '...';
    const ageMin = claimingSession ? Math.round(claimingSession.claim_duration_minutes || 0) : '?';

    // FR-6: Show heartbeat age to indicate session freshness
    let heartbeatInfo = '';
    if (claimingSession) {
      const heartbeatAge = claimingSession.heartbeat_age_human ||
        formatHeartbeatAge(claimingSession.heartbeat_age_seconds);
      const heartbeatSeconds = Math.round(claimingSession.heartbeat_age_seconds || 0);

      // Color code heartbeat status
      if (heartbeatSeconds >= 180) {
        heartbeatInfo = ` ${colors.red}(heartbeat: ${heartbeatAge} - may be stale)${colors.reset}`;
      } else if (heartbeatSeconds >= 60) {
        heartbeatInfo = ` ${colors.yellow}(heartbeat: ${heartbeatAge})${colors.reset}`;
      } else {
        heartbeatInfo = ` ${colors.green}(heartbeat: ${heartbeatAge})${colors.reset}`;
      }
    }

    console.log(`${colors.dim}${indent}        └─ Claimed by session ${shortId} (${ageMin}m)${heartbeatInfo}${colors.reset}`);
  }

  // Show blockers if not resolved and not claimed
  if (!item.deps_resolved && item.dependencies && !isClaimedByOther) {
    const deps = parseDependencies(item.dependencies);
    const unresolvedDeps = deps.filter(d => !d.resolved);
    if (unresolvedDeps.length > 0) {
      console.log(`${colors.dim}${indent}        └─ Blocked by: ${unresolvedDeps.map(d => d.sd_id).join(', ')}${colors.reset}`);
    }
  }

  // Show sibling dependency status for child SDs (pre-computed)
  if (item.childDepStatus && !item.childDepStatus.allComplete) {
    console.log(`${colors.dim}${indent}        └─ Child deps: ${item.childDepStatus.summary}${colors.reset}`);
  }

  // Display children recursively
  const children = childItems.get(sdId) || childItems.get(item.id) || [];
  const childrenInTrack = children.filter(c => allItems.includes(c));

  for (let i = 0; i < childrenInTrack.length; i++) {
    const child = childrenInTrack[i];
    const isLast = i === childrenInTrack.length - 1;
    const childIndent = indent + (isLast ? '  └─ ' : '  ├─ ');
    const nextIndent = indent + (isLast ? '     ' : '  │  ');

    // For children, use simpler display
    displaySDItemSimple(child, childIndent, nextIndent, childItems, allItems);
  }
}

/**
 * Display child SD item (simpler format for nested items)
 *
 * @param {Object} item - SD item to display
 * @param {string} prefix - Prefix for this line
 * @param {string} nextIndent - Indentation for next level
 * @param {Map} childItems - Map of parent_sd_id -> children
 * @param {Array} allItems - All items in the track
 */
function displaySDItemSimple(item, prefix, nextIndent, childItems, allItems) {
  const sdId = item.sd_key || item.sd_id;

  // Status icon - now phase-aware (Control Gap Fix)
  const statusIcon = getPhaseAwareStatus(item);

  const workingIcon = item.is_working_on ? `${colors.bgYellow}◆${colors.reset}` : '';
  const title = (item.title || '').substring(0, 30);
  const simpleVisionBadge = formatVisionBadge(item.vision_score ?? item.vision_alignment_score);

  console.log(`${prefix}${workingIcon}${sdId} - ${title}${simpleVisionBadge}... ${statusIcon}`);

  // Recursively show grandchildren
  const children = childItems.get(sdId) || childItems.get(item.id) || [];
  const childrenInTrack = children.filter(c => allItems.includes(c));

  for (let i = 0; i < childrenInTrack.length; i++) {
    const child = childrenInTrack[i];
    const isLast = i === childrenInTrack.length - 1;
    const childPrefix = nextIndent + (isLast ? '└─ ' : '├─ ');
    const childNextIndent = nextIndent + (isLast ? '   ' : '│  ');

    displaySDItemSimple(child, childPrefix, childNextIndent, childItems, allItems);
  }
}

/**
 * Format heartbeat age for display (helper for claim ownership display)
 * @param {number} seconds - Heartbeat age in seconds
 * @returns {string} - Human-readable age
 */
function formatHeartbeatAge(seconds) {
  if (!seconds || seconds < 0) return 'just now';
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

/**
 * Display multi-repo status warning if uncommitted changes exist
 *
 * @param {Object} multiRepoStatus - Multi-repo status object
 */
export function displayMultiRepoWarning(multiRepoStatus) {
  if (!multiRepoStatus || !multiRepoStatus.hasChanges) return;

  const minAgeDays = multiRepoStatus.minAgeDays || 5;

  console.log(`\n${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.bgYellow}${colors.bold} MULTI-REPO WARNING ${colors.reset}`);
  console.log(`${colors.dim}(Showing files ≥${minAgeDays} days old)${colors.reset}\n`);

  for (const repo of multiRepoStatus.summary) {
    const icon = repo.uncommittedCount > 0 ? '📝' : '📤';
    console.log(`  ${icon} ${colors.bold}${repo.displayName}${colors.reset} (${repo.branch})`);

    if (repo.uncommittedCount > 0) {
      console.log(`     ${repo.uncommittedCount} uncommitted change(s)`);
    }
    if (repo.unpushedCount > 0) {
      console.log(`     ${repo.unpushedCount} unpushed commit(s)`);
    }
  }

  console.log(`\n  ${colors.yellow}⚠️  Commit changes before starting new SD work${colors.reset}`);
  console.log(`  ${colors.dim}Run: node scripts/multi-repo-status.js for details${colors.reset}`);
}
