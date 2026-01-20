/**
 * Tracks Display for SD-Next
 * Part of SD-LEO-REFACTOR-SD-NEXT-001
 */

import { colors, trackColors } from '../colors.js';
import { getPhaseAwareStatus } from '../status-helpers.js';
import { parseDependencies } from '../dependency-resolver.js';

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
        (i.legacy_id || i.sd_id) === item.parent_sd_id || i.id === item.parent_sd_id
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

  const sdId = item.legacy_id || item.sd_id;
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

  console.log(`${indent}${claimedIcon}${workingIcon}${rankStr} ${sdId} - ${title}... ${statusIcon}`);

  // Show who claimed it
  if (isClaimedByOther) {
    const claimingSession = activeSessions.find(s => s.session_id === claimedBySession);
    const shortId = claimedBySession.substring(0, 12) + '...';
    const ageMin = claimingSession ? Math.round(claimingSession.claim_duration_minutes || 0) : '?';
    console.log(`${colors.dim}${indent}        └─ Claimed by session ${shortId} (${ageMin}m)${colors.reset}`);
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
  const sdId = item.legacy_id || item.sd_id;

  // Status icon - now phase-aware (Control Gap Fix)
  const statusIcon = getPhaseAwareStatus(item);

  const workingIcon = item.is_working_on ? `${colors.bgYellow}◆${colors.reset}` : '';
  const title = (item.title || '').substring(0, 30);

  console.log(`${prefix}${workingIcon}${sdId} - ${title}... ${statusIcon}`);

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
