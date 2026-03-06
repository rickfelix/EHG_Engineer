/**
 * Quick Fixes Display for SD-Next
 * Shows open quick fixes in the queue with re-triage escalation warnings
 * and claim badges for multi-session awareness.
 */

import { colors } from '../colors.js';
import { analyzeClaimRelationship } from '../claim-analysis.js';

const MAX_DISPLAY = 10;

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * Display open quick fixes section.
 *
 * @param {Array} quickFixes - Open quick fixes from loadOpenQuickFixes
 * @param {Map} triageResults - Re-triage results from triageQuickFixes (qfId -> TriageResult)
 * @param {Object} sessionContext - Session context for claim analysis
 * @returns {{ escalationCount: number, totalCount: number, topQF: Object|null }}
 */
export function displayQuickFixes(quickFixes, triageResults = new Map(), sessionContext = {}) {
  const summary = { escalationCount: 0, totalCount: 0, topQF: null };

  if (!quickFixes || quickFixes.length === 0) return summary;

  summary.totalCount = quickFixes.length;

  const { claimedSDs = new Map(), currentSession = null, activeSessions = [] } = sessionContext;

  // Classify each QF: escalation-flagged (tier 3 re-triage) vs normal, plus claim status
  const classified = quickFixes.map(qf => {
    const triage = triageResults.get(qf.id);
    const escalate = triage && triage.tier === 3;
    if (escalate) summary.escalationCount++;

    // Claim analysis
    let claimBadge = '';
    let isClaimedByOther = false;

    const claimingSessionId = qf.claiming_session_id || claimedSDs.get(qf.id);
    if (claimingSessionId && currentSession) {
      if (claimingSessionId === currentSession.session_id) {
        claimBadge = `${colors.green}YOURS${colors.reset} `;
      } else {
        isClaimedByOther = true;
        // Try richer analysis if we have session data
        const claimingSession = activeSessions.find(s => s.session_id === claimingSessionId);
        if (claimingSession) {
          const analysis = analyzeClaimRelationship({
            claimingSessionId,
            claimingSession,
            currentSession
          });
          if (analysis.relationship === 'same_conversation') {
            claimBadge = `${colors.green}${analysis.displayLabel}${colors.reset} `;
            isClaimedByOther = false;
          } else {
            claimBadge = analysis.relationship.startsWith('stale')
              ? `${colors.yellow}${analysis.displayLabel}${colors.reset} `
              : `${colors.yellow}CLAIMED${colors.reset} `;
          }
        } else {
          claimBadge = `${colors.yellow}CLAIMED${colors.reset} `;
        }
      }
    }

    return { ...qf, _triage: triage, _escalate: escalate, _claimBadge: claimBadge, _isClaimedByOther: isClaimedByOther };
  });

  // Sort: escalation first, then severity, then age (oldest first — already sorted by created_at ASC from DB)
  classified.sort((a, b) => {
    if (a._escalate !== b._escalate) return a._escalate ? -1 : 1;
    const sevA = SEVERITY_ORDER[a.severity] ?? 4;
    const sevB = SEVERITY_ORDER[b.severity] ?? 4;
    if (sevA !== sevB) return sevA - sevB;
    return new Date(a.created_at) - new Date(b.created_at);
  });

  summary.topQF = classified[0] || null;
  // Skip claimed-by-others QFs from topStartableQF selection
  summary.topStartableQF = classified.find(qf => !qf._escalate && !qf._isClaimedByOther) || null;

  // Display header
  console.log(`\n${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.bold}${colors.yellow}OPEN QUICK FIXES (${summary.totalCount}):${colors.reset}\n`);

  const displayed = classified.slice(0, MAX_DISPLAY);

  for (const qf of displayed) {
    const age = formatAge(qf.created_at);
    const loc = qf.estimated_loc ? `~${qf.estimated_loc} LOC` : 'LOC unknown';
    const target = qf.target_application || 'N/A';
    const badge = qf._claimBadge;

    if (qf._escalate) {
      // Escalation row
      const reason = qf._triage?.escalationReason || 'Re-triage returned Tier 3';
      console.log(`  ${colors.red}${colors.bold}⚠ ESCALATE${colors.reset}  ${badge}${qf.id} - ${truncate(qf.title, 45)}  ${colors.dim}${qf.severity}  ${age}${colors.reset}`);
      console.log(`       ${colors.dim}Re-triage: Tier 3 — ${reason}${colors.reset}`);
      console.log(`       ${colors.dim}Action: /leo create --from-qf ${qf.id}${colors.reset}`);
    } else {
      // Normal row
      const tier = qf._triage ? qf._triage.tier : inferTier(qf.estimated_loc);
      const tierBadge = `[T${tier}]`;
      const statusBadge = qf.status === 'in_progress' ? `${colors.cyan}WIP${colors.reset} ` : '';
      console.log(`  ${colors.bold}${tierBadge}${colors.reset} ${badge}${statusBadge}${qf.id} - ${truncate(qf.title, 45)}  ${colors.dim}${qf.severity}  ${age}${colors.reset}`);
      console.log(`       ${colors.dim}Est: ${loc} | Type: ${qf.type} | Target: ${target}${colors.reset}`);
    }
  }

  if (summary.totalCount > MAX_DISPLAY) {
    console.log(`\n  ${colors.dim}... and ${summary.totalCount - MAX_DISPLAY} more${colors.reset}`);
  }

  console.log(`\n  ${colors.dim}Manage: /leo QF-<ID>    Start: /leo QF-<ID>${colors.reset}`);

  return summary;
}

/**
 * Infer display tier from estimated LOC when triage result is unavailable.
 */
function inferTier(estimatedLoc) {
  if (!estimatedLoc || estimatedLoc <= 30) return 1;
  if (estimatedLoc <= 75) return 2;
  return 3;
}

/**
 * Format a human-readable age from a timestamp.
 */
function formatAge(createdAt) {
  if (!createdAt) return '';
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return 'today';
  if (days === 1) return '1d old';
  return `${days}d old`;
}

/**
 * Truncate a string to maxLen characters with ellipsis.
 */
function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}
