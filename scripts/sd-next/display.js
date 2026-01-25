/**
 * Display functions for SD-next
 * Handles all terminal output and formatting
 */

import { colors } from './colors.js';
import { getPhaseAwareStatus, isActionableForLead } from './status-helpers.js';
import { parseDependencies, checkDependenciesResolved } from './dependency-utils.js';
import { supabase } from './data-loaders.js';
import { getEstimatedDuration, formatEstimateShort } from '../lib/duration-estimator.js';
import { checkDependencyStatus } from '../child-sd-preflight.js';

/**
 * Display active sessions
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
 * Display multi-repo warning
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

/**
 * Display OKR scorecard
 */
export function displayOKRScorecard(vision, scorecard) {
  if (!scorecard || scorecard.length === 0) return;

  if (vision) {
    console.log(`${colors.dim}┌─ VISION: ${vision.code} ${'─'.repeat(Math.max(0, 52 - vision.code.length))}┐${colors.reset}`);
    const stmt = vision.statement.substring(0, 63);
    console.log(`${colors.dim}│${colors.reset} ${colors.white}"${stmt}"${colors.reset}`);
    console.log(`${colors.dim}└${'─'.repeat(67)}┘${colors.reset}\n`);
  }

  console.log(`${colors.bold}┌─ OKR SCORECARD ${'─'.repeat(52)}┐${colors.reset}`);
  console.log(`${colors.bold}│${colors.reset}`);

  for (const obj of scorecard) {
    const dots = obj.progress_dots || '[○○○○○]';
    const pct = obj.avg_progress_pct ? `${Math.round(obj.avg_progress_pct)}%` : '0%';
    const statusColor = obj.at_risk_krs > 0 ? colors.yellow : colors.green;

    console.log(`${colors.bold}│${colors.reset} ${colors.bold}${obj.objective_code}${colors.reset}: ${obj.objective_title.substring(0, 35)}`);
    console.log(`${colors.bold}│${colors.reset}   ${statusColor}${dots}${colors.reset} ${pct} avg | ${obj.total_krs} KRs`);

    if (obj.key_results && obj.key_results.length > 0) {
      for (const kr of obj.key_results) {
        const krStatus = kr.status === 'achieved' ? `${colors.green}✓` :
                        kr.status === 'on_track' ? `${colors.green}●` :
                        kr.status === 'at_risk' ? `${colors.yellow}●` :
                        kr.status === 'off_track' ? `${colors.red}●` : `${colors.dim}○`;

        let progress = 0;
        if (kr.target_value && kr.target_value !== 0) {
          if (kr.direction === 'decrease') {
            progress = ((kr.baseline_value - kr.current_value) / (kr.baseline_value - kr.target_value)) * 100;
          } else {
            progress = ((kr.current_value - (kr.baseline_value || 0)) / (kr.target_value - (kr.baseline_value || 0))) * 100;
          }
        }
        progress = Math.min(100, Math.max(0, progress));

        const barFilled = Math.round(progress / 10);
        const barEmpty = 10 - barFilled;
        const progressBar = '█'.repeat(barFilled) + '░'.repeat(barEmpty);

        const current = kr.current_value ?? 0;
        const target = kr.target_value ?? 0;
        const unit = kr.unit || '';

        console.log(`${colors.bold}│${colors.reset}     ${krStatus}${colors.reset} ${kr.code.substring(0, 20).padEnd(20)} ${progressBar} ${current}${unit}→${target}${unit}`);
      }
    }
    console.log(`${colors.bold}│${colors.reset}`);
  }

  console.log(`${colors.bold}└${'─'.repeat(67)}┘${colors.reset}\n`);
}

/**
 * Display pending proposals
 */
export function displayProposals(pendingProposals) {
  if (pendingProposals.length === 0) return;

  console.log(`\n${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.bold}${colors.magenta}SUGGESTED (Proactive Proposals):${colors.reset}\n`);

  for (const p of pendingProposals) {
    const urgencyIcon = p.urgency_level === 'critical' ? `${colors.red}🔴` :
                        p.urgency_level === 'medium' ? `${colors.yellow}🟡` : `${colors.green}🟢`;
    const triggerLabel = {
      'dependency_update': 'DEP',
      'retrospective_pattern': 'RETRO',
      'code_health': 'HEALTH'
    }[p.trigger_type] || p.trigger_type.substring(0, 5).toUpperCase();
    const confidence = (p.confidence_score * 100).toFixed(0);
    const shortId = p.id.substring(0, 8);

    console.log(`  ${urgencyIcon} [${triggerLabel}]${colors.reset} ${p.title.substring(0, 50)}...`);
    console.log(`${colors.dim}    Confidence: ${confidence}% | ID: ${shortId} | approve: npm run proposal:approve ${shortId}${colors.reset}`);
  }

  console.log(`\n${colors.dim}  Dismiss: npm run proposal:dismiss <id> <reason>${colors.reset}`);
  console.log(`${colors.dim}  Reasons: not_relevant, wrong_timing, duplicate, too_small, too_large, already_fixed${colors.reset}`);
}

/**
 * Display track section
 */
export function displayTrackSection(trackKey, trackName, items, context = {}) {
  if (items.length === 0) return;

  const trackColors = {
    A: colors.magenta,
    B: colors.blue,
    C: colors.cyan,
    STANDALONE: colors.yellow,
    UNASSIGNED: colors.dim
  };

  console.log(`\n${trackColors[trackKey]}${colors.bold}TRACK ${trackKey}: ${trackName}${colors.reset}`);

  // Group items by parent for hierarchical display
  const rootItems = [];
  const childItems = new Map();

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

  // Add items whose parent is not in this track as roots
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
    displaySDItem(item, '', childItems, items, context);
  }
}

/**
 * Display a single SD item with its children
 */
export function displaySDItem(item, indent, childItems, allItems, context = {}) {
  const { claimedSDs = new Map(), currentSession, activeSessions = [] } = context;
  const sdId = item.sd_key || item.sd_id;
  const rankStr = item.sequence_rank ? `[${item.sequence_rank}]`.padEnd(5) : '     ';

  const claimedBySession = claimedSDs.get(sdId);
  const isClaimedByOther = claimedBySession &&
    currentSession &&
    claimedBySession !== currentSession.session_id;
  const isClaimedByMe = claimedBySession &&
    currentSession &&
    claimedBySession === currentSession.session_id;

  let statusIcon;
  if (isClaimedByOther) {
    statusIcon = `${colors.yellow}CLAIMED${colors.reset}`;
  } else if (isClaimedByMe) {
    statusIcon = `${colors.green}YOURS${colors.reset}`;
  } else {
    statusIcon = getPhaseAwareStatus(item);
  }

  const workingIcon = item.is_working_on ? `${colors.bgYellow} ACTIVE ${colors.reset} ` : '';
  const claimedIcon = isClaimedByOther ? `${colors.bgBlue} CLAIMED ${colors.reset} ` : '';
  const title = (item.title || '').substring(0, 40 - indent.length);

  console.log(`${indent}${claimedIcon}${workingIcon}${rankStr} ${sdId} - ${title}... ${statusIcon}`);

  if (isClaimedByOther) {
    const claimingSession = activeSessions.find(s => s.session_id === claimedBySession);
    const shortId = claimedBySession.substring(0, 12) + '...';
    const ageMin = claimingSession ? Math.round(claimingSession.claim_duration_minutes || 0) : '?';
    console.log(`${colors.dim}${indent}        └─ Claimed by session ${shortId} (${ageMin}m)${colors.reset}`);
  }

  if (!item.deps_resolved && item.dependencies && !isClaimedByOther) {
    const deps = parseDependencies(item.dependencies);
    const unresolvedDeps = deps.filter(d => !d.resolved);
    if (unresolvedDeps.length > 0) {
      console.log(`${colors.dim}${indent}        └─ Blocked by: ${unresolvedDeps.map(d => d.sd_id).join(', ')}${colors.reset}`);
    }
  }

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

    displaySDItemSimple(child, childIndent, nextIndent, childItems, allItems);
  }
}

/**
 * Display child SD item (simpler format)
 */
export function displaySDItemSimple(item, prefix, nextIndent, childItems, allItems) {
  const sdId = item.sd_key || item.sd_id;
  const statusIcon = getPhaseAwareStatus(item);
  const workingIcon = item.is_working_on ? `${colors.bgYellow}◆${colors.reset}` : '';
  const title = (item.title || '').substring(0, 30);

  console.log(`${prefix}${workingIcon}${sdId} - ${title}... ${statusIcon}`);

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
 * Display recommendations section
 */
export async function displayRecommendations(baselineItems, actuals, conflicts = [], context = {}) {
  console.log(`\n${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.bold}${colors.green}RECOMMENDED ACTIONS:${colors.reset}\n`);

  // Check for "working on" SD first
  const { data: workingOn } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, progress_percentage')
    .eq('is_active', true)
    .eq('is_working_on', true)
    .lt('progress_percentage', 100)
    .single();

  if (workingOn) {
    console.log(`${colors.bgYellow}${colors.bold} CONTINUE ${colors.reset} ${workingOn.sd_key}`);
    console.log(`  ${workingOn.title}`);
    console.log(`  ${colors.dim}Progress: ${workingOn.progress_percentage || 0}% | Marked as "Working On"${colors.reset}`);

    try {
      const { data: sdFull } = await supabase
        .from('strategic_directives_v2')
        .select('id, sd_type, category, priority')
        .eq('sd_key', workingOn.sd_key)
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

  // Find ready and verification-needed SDs
  const readySDs = [];
  const needsVerificationSDs = [];

  for (const item of baselineItems) {
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, status, current_phase, progress_percentage, dependencies, is_active')
      .eq('sd_key', item.sd_id)
      .single();

    if (sd && sd.is_active && sd.status !== 'completed' && sd.status !== 'cancelled') {
      const depsResolved = await checkDependenciesResolved(sd.dependencies);
      const enrichedSD = { ...item, ...sd, deps_resolved: depsResolved };

      if (sd.current_phase === 'EXEC_COMPLETE' || sd.status === 'review') {
        needsVerificationSDs.push(enrichedSD);
      } else if (depsResolved && isActionableForLead(enrichedSD)) {
        readySDs.push(enrichedSD);
      }
    }
  }

  // Show verification needed first
  if (needsVerificationSDs.length > 0) {
    console.log(`${colors.bgMagenta}${colors.bold} NEEDS VERIFICATION ${colors.reset}`);
    needsVerificationSDs.forEach(sd => {
      console.log(`  ${sd.sd_key} - ${sd.title.substring(0, 45)}...`);
      console.log(`  ${colors.dim}Phase: ${sd.current_phase} | Status: ${sd.status} | Run: npm run sd:verify ${sd.sd_key}${colors.reset}\n`);
    });
  }

  if (readySDs.length > 0 && !workingOn) {
    const top = readySDs[0];
    console.log(`${colors.bgGreen}${colors.bold} START ${colors.reset} ${top.sd_key}`);
    console.log(`  ${top.title}`);
    console.log(`  ${colors.dim}Track: ${top.track || 'N/A'} | Rank: ${top.sequence_rank} | All dependencies satisfied${colors.reset}`);

    try {
      const { data: sdFull } = await supabase
        .from('strategic_directives_v2')
        .select('id, sd_type, category, priority')
        .eq('sd_key', top.sd_key)
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

  // Show parallel opportunities
  const parallelReady = readySDs.filter(sd => sd.track !== readySDs[0]?.track).slice(0, 2);
  if (parallelReady.length > 0) {
    console.log(`${colors.cyan}PARALLEL OPPORTUNITIES:${colors.reset}`);
    parallelReady.forEach(sd => {
      console.log(`  Track ${sd.track}: ${sd.sd_key} - ${sd.title.substring(0, 40)}...`);
    });
  }

  // Show conflicts
  if (conflicts.length > 0) {
    console.log(`\n${colors.red}${colors.bold}CONFLICT WARNINGS:${colors.reset}`);
    conflicts.forEach(c => {
      console.log(`  ${colors.red}!${colors.reset} ${c.sd_id_a} + ${c.sd_id_b}: ${c.conflict_type}`);
    });
  }

  console.log(`\n${colors.bold}TO BEGIN WORK:${colors.reset}`);
  console.log(`  ${colors.cyan}npm run sd:start <SD-ID>${colors.reset}  ${colors.dim}(recommended - claims SD and shows info)${colors.reset}`);
  console.log(`  ${colors.dim}OR: node scripts/handoff.js execute LEAD-TO-PLAN <SD-ID>${colors.reset}`);
}

/**
 * Display session context
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
