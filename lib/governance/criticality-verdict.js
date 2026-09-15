/**
 * SD-LEO-INFRA-FILING-TOOLS-ENFORCE-001 (FR-1/FR-2/FR-3, TR-5)
 *
 * Pure criticality-verdict resolver, shared by the QF gate (create-quick-fix.js) and the
 * SD gate (createSD()). Extracted as its own module because createQuickFix() in
 * create-quick-fix.js is not exported and constructs its own Supabase client inline --
 * this function is unit-testable independent of both.
 *
 * The four criticality criteria (chairman ratification e38df53f, 2026-09-14): breaks a
 * venture stage or the coming test venture, loses data, stops the fleet working, or is a
 * security risk.
 */

import { emitFeedback } from './emit-feedback.js';

export const CRITICALITY_CRITERIA = [
  'breaks a venture stage or the coming test venture',
  'loses data',
  'stops the fleet working',
  'is a security risk',
];

const VALID_VERDICTS = new Set(['critical', 'later']);

/** Normalize a raw --criticality value: trim, lowercase; anything not critical/later is unrecognized. */
export function normalizeCriticality(raw) {
  if (typeof raw !== 'string') return null;
  const norm = raw.trim().toLowerCase();
  return VALID_VERDICTS.has(norm) ? norm : null;
}

/**
 * Resolve what a filing tool should do given a raw --criticality value and whether its
 * enforce flag is on.
 *
 * @param {{criticality?: string, flagEnabled: boolean}} args
 * @returns {{verdict: 'refuse'|'warn_and_file'|'route_later'|'file_critical', message: string}}
 */
export function resolveCriticalityVerdict({ criticality, flagEnabled }) {
  const normalized = normalizeCriticality(criticality);

  if (normalized === 'critical') {
    return { verdict: 'file_critical', message: '' };
  }
  if (normalized === 'later') {
    return { verdict: 'route_later', message: '' };
  }

  // Missing or unrecognized value is treated identically -- never silently defaults to 'critical'.
  const criteriaList = CRITICALITY_CRITERIA.map((c) => `  - ${c}`).join('\n');
  if (flagEnabled) {
    return {
      verdict: 'refuse',
      message:
        '--criticality is required (critical|later). Ask: is this critical? A critical item ' +
        `meets at least one of:\n${criteriaList}\nIf not, file with --criticality later instead.`,
    };
  }
  return {
    verdict: 'warn_and_file',
    message:
      '... would have REFUSED filing (no --criticality) ... but the criticality gate is not enabled -- filing anyway.',
  };
}

/**
 * FR-3: route a 'later' verdict to the existing harness_backlog feedback channel.
 * Shared by FR-1 (create-quick-fix.js) and FR-2 (createSD()).
 *
 * SECURITY finding SEC-3 (EXEC-TO-PLAN): without a dedup_key, emitFeedback's dedup hash
 * reduces to sha256(today::description::""), so two DIFFERENT items filed the same day with
 * an identical description collapse into one row -- the harness_backlog row is a deferred
 * item's ONLY record, so a collapse silently loses it. dedupKey must be supplied by the
 * caller and should be the most specific identifier available at the call site (e.g. the
 * already-generated sdKey for FR-2, or a finding-identity composite for FR-1).
 *
 * @param {{supabase: object, title: string, description: string, criticalityReason?: string, loggedVia: string, dedupKey: string}} args
 * @returns {Promise<{id: string|null, deduped: boolean}>}
 */
export async function routeCriticalityLater({ supabase, title, description, criticalityReason, loggedVia, dedupKey }) {
  // Fail loud rather than silently reintroducing the SEC-3 collapse: an omitted/empty dedupKey
  // would pass dedup_key:undefined to emitFeedback, reducing its dedup hash to
  // sha256(today::description::"") and letting two different same-day, same-description items
  // collapse into one row. This guard is the shared function's own defense so a future third
  // caller (not just the two current, already-fixed call sites) cannot reintroduce it silently.
  if (!dedupKey || !String(dedupKey).trim()) {
    throw new Error('routeCriticalityLater: dedupKey is required (a specific per-item identity, not a shared/blank value) -- see SEC-3');
  }
  const result = await emitFeedback({
    supabase,
    title,
    description,
    category: 'harness_backlog',
    severity: 'medium',
    source_type: 'manual_feedback',
    dedup_key: dedupKey,
    metadata: {
      logged_via: loggedVia,
      criticality_reason: criticalityReason || '',
      deferred_from: `${title}${description ? ` — ${description}` : ''}`,
    },
  });
  if (result.deduped) {
    console.log(`   already routed to harness_backlog (feedback id: ${result.id}, deduped)`);
  } else {
    console.log(`   routed to harness_backlog (feedback id: ${result.id})`);
  }
  return result;
}
