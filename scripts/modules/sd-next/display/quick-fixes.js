/**
 * Quick Fixes Display for SD-Next
 * Shows open quick fixes in the queue with re-triage escalation warnings
 * and claim badges for multi-session awareness.
 */

import { colors } from '../colors.js';
import { analyzeClaimRelationship } from '../claim-analysis.js';

const MAX_DISPLAY = 10;

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

// QF-20260525-522: freshness/supersession gate. AUTO-PROCEED must NOT auto-route
// to a QF that may have been resolved by a *different* SD (one with no PR of its
// own). A QF that is old, still 'open', unclaimed, and has no PR/commit is a
// supersession risk — it gets flagged 'verify-first' and held out of
// topStartableQF so AUTO_PROCEED_ACTION:qf_start is not emitted for it (the queue
// falls through to /leo assist instead). Tunable via SD_NEXT_QF_STALE_DAYS.
const STALE_QF_DAYS = Number(process.env.SD_NEXT_QF_STALE_DAYS) || 3;

/**
 * Classify open quick fixes: compute per-QF escalation flag, claim badge,
 * and return the summary + classified list. Pure presentation-adjacent logic;
 * does not print.
 *
 * Used by:
 *   - showFallbackQueue / displayTracks: pre-ranking enrichment so QFs can
 *     be interleaved with SDs (SD-LEO-INFRA-UNIFY-QUICK-FIX-001).
 *   - displayQuickFixes: legacy separate-section display (kept for back-compat).
 *
 * @returns {{
 *   summary: { totalCount: number, escalationCount: number, topQF: Object|null, topStartableQF: Object|null },
 *   classified: Array<Object>
 * }}
 */
export function classifyQuickFixes(quickFixes, triageResults = new Map(), sessionContext = {}) {
  const summary = { escalationCount: 0, totalCount: 0, topQF: null, topStartableQF: null };

  if (!quickFixes || quickFixes.length === 0) return { summary, classified: [] };

  summary.totalCount = quickFixes.length;

  const { claimedSDs = new Map(), currentSession = null, activeSessions = [] } = sessionContext;

  const classified = quickFixes.map(qf => {
    const triage = triageResults.get(qf.id);
    const escalate = triage && triage.tier === 3;
    if (escalate) summary.escalationCount++;

    let claimBadge = '';
    let isClaimedByOther = false;

    const claimingSessionId = qf.claiming_session_id || claimedSDs.get(qf.id);
    if (claimingSessionId && currentSession) {
      if (claimingSessionId === currentSession.session_id) {
        claimBadge = `${colors.green}YOURS${colors.reset} `;
      } else {
        isClaimedByOther = true;
        const claimingSession = activeSessions.find(s => s.session_id === claimingSessionId);
        if (claimingSession) {
          const analysis = analyzeClaimRelationship({ claimingSessionId, claimingSession, currentSession });
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

    // QF-20260525-522: supersession risk — old, open, unclaimed, no PR/commit.
    const verifyFirst =
      !escalate &&
      qf.status === 'open' &&
      !claimingSessionId &&
      !qf.pr_url &&
      !qf.commit_sha &&
      ageDays(qf.created_at) >= STALE_QF_DAYS;

    return { ...qf, _triage: triage, _escalate: escalate, _claimBadge: claimBadge, _isClaimedByOther: isClaimedByOther, _verifyFirst: verifyFirst };
  });

  classified.sort((a, b) => {
    if (a._escalate !== b._escalate) return a._escalate ? -1 : 1;
    const sevA = SEVERITY_ORDER[a.severity] ?? 4;
    const sevB = SEVERITY_ORDER[b.severity] ?? 4;
    if (sevA !== sevB) return sevA - sevB;
    return new Date(a.created_at) - new Date(b.created_at);
  });

  summary.topQF = classified[0] || null;
  // QF-20260525-522: exclude verify-first (possibly-superseded) QFs from the
  // auto-startable pick so AUTO-PROCEED doesn't route a session to dead work.
  // QF-20260525-701: also require status==='open'. Loaders fetch [open, in_progress],
  // and _verifyFirst only flags 'open' rows — so an orphaned in_progress QF (dead holder
  // => claiming_session_id null, no PR) would otherwise be emitted as AUTO_PROCEED_ACTION:
  // qf_start and auto-started without verify-first. in_progress is either actively owned or
  // orphaned; neither is auto-startable.
  summary.topStartableQF = classified.find(qf => qf.status === 'open' && !qf._escalate && !qf._isClaimedByOther && !qf._verifyFirst) || null;

  return { summary, classified };
}

/**
 * Render a single QF row inline within a track. Used by tracks.js when
 * interleaving QFs with SDs in the unified queue display (FR-4).
 *
 * Output format matches the legacy OPEN QUICK FIXES section row format so
 * visual muscle-memory is preserved — tier badge, claim badge, severity,
 * age, and (for escalations) the triage reason + action.
 *
 * @param {Object} qf - Classified QF (from classifyQuickFixes)
 * @param {string} indent - Leading whitespace for hierarchical placement
 */
export function renderQFRow(qf, indent = '') {
  const age = formatAge(qf.created_at);
  const loc = qf.estimated_loc ? `~${qf.estimated_loc} LOC` : 'LOC unknown';
  const target = qf.target_application || 'N/A';
  const badge = qf._claimBadge || '';

  if (qf._escalate) {
    const reason = qf._triage?.escalationReason || 'Re-triage returned Tier 3';
    console.log(`${indent}  ${colors.red}${colors.bold}⚠ ESCALATE${colors.reset}  ${badge}${qf.id} - ${truncate(qf.title, 45)}  ${colors.dim}${qf.severity}  ${age}${colors.reset}`);
    console.log(`${indent}       ${colors.dim}Re-triage: Tier 3 — ${reason}${colors.reset}`);
    console.log(`${indent}       ${colors.dim}Action: /leo create --from-qf ${qf.id}${colors.reset}`);
  } else {
    const tier = qf._triage ? qf._triage.tier : inferTier(qf.estimated_loc);
    const tierBadge = `[T${tier}]`;
    const statusBadge = qf.status === 'in_progress' ? `${colors.cyan}WIP${colors.reset} ` : '';
    // QF-20260525-522: surface why a stale QF was held out of auto-start.
    const verifyBadge = qf._verifyFirst ? `${colors.yellow}⚠ VERIFY-FIRST${colors.reset} ` : '';
    console.log(`${indent}  ${colors.bold}${tierBadge}${colors.reset} ${badge}${verifyBadge}${statusBadge}${qf.id} - ${truncate(qf.title, 45)}  ${colors.dim}${qf.severity}  ${age}${colors.reset}`);
    console.log(`${indent}       ${colors.dim}Est: ${loc} | Type: ${qf.type} | Target: ${target}${colors.reset}`);
    if (qf._verifyFirst) {
      console.log(`${indent}       ${colors.dim}⚠ open ${ageDays(qf.created_at)}d & unclaimed — may already be resolved by another SD; verify before starting (not auto-routed)${colors.reset}`);
    }
  }
}

/**
 * Legacy display: print a separate OPEN QUICK FIXES section at the bottom of
 * the queue. Kept for back-compat; the preferred path is to interleave QFs
 * with SDs via rankItems() + renderQFRow() (SD-LEO-INFRA-UNIFY-QUICK-FIX-001).
 *
 * Returns the summary so callers can still compute AUTO_PROCEED_ACTION.
 *
 * @deprecated Prefer classifyQuickFixes() + inline rendering via tracks.js.
 */
export function displayQuickFixes(quickFixes, triageResults = new Map(), sessionContext = {}) {
  const { summary, classified } = classifyQuickFixes(quickFixes, triageResults, sessionContext);
  if (!quickFixes || quickFixes.length === 0) return summary;

  console.log(`\n${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.bold}${colors.yellow}OPEN QUICK FIXES (${summary.totalCount}):${colors.reset}\n`);

  const displayed = classified.slice(0, MAX_DISPLAY);
  for (const qf of displayed) {
    renderQFRow(qf);
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
 * Whole-day age of a timestamp. QF-20260525-522: shared by the freshness gate
 * and formatAge so the "verify-first" threshold and the displayed age agree.
 */
function ageDays(createdAt) {
  if (!createdAt) return 0;
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Format a human-readable age from a timestamp.
 */
function formatAge(createdAt) {
  if (!createdAt) return '';
  const days = ageDays(createdAt);
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
