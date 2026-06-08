/**
 * Feature-flag governance review — pure staleness classification.
 * SD-LEO-INFRA-ACTIVATE-FEATURE-FLAG-001 (FR-1 / FR-2).
 *
 * Shared by scripts/flag-governance-review.mjs (the scheduled cheap-poller that
 * stamps last_reviewed_at + emits the digest) and the /flags stale CLI report.
 * Kept pure (no DB / no clock of its own — `now` and `flags` are injected) so it
 * is unit-testable without Supabase.
 */

// A flag that has been disabled and untouched for this long is "aging" — it is
// dead weight in the registry that nobody has graduated or killed.
export const DISABLED_AGING_DAYS = 30;
// An enabled flag that was never marked rolled_out is a graduation candidate
// once it has been enabled at least this long.
export const ENABLED_UNROLLED_DAYS = 14;
const DAY_MS = 24 * 3600 * 1000;

function ageDays(ts, now) {
  if (!ts) return Infinity;
  return (now - new Date(ts).getTime()) / DAY_MS;
}

/**
 * Classify a single flag's staleness. Returns null when the flag is healthy.
 * @param {object} flag - a leo_feature_flags row
 * @param {number} now - epoch ms (injected for testability)
 * @returns {{flag_key:string, reasons:string[], recommendation:'graduate'|'kill'|'extend'|'review', detail:string}|null}
 */
export function classifyFlag(flag, now) {
  const reasons = [];
  const lifecycle = flag.lifecycle_state;
  // Terminal states are intentionally settled — never "stale".
  if (lifecycle === 'archived' || lifecycle === 'expired') return null;

  const neverReviewed = !flag.last_reviewed_at;
  const expiry = flag.expiry_at ? new Date(flag.expiry_at).getTime() : null;
  const pastExpiry = expiry !== null && expiry < now;
  // Age is measured from created_at, NOT updated_at: the review job stamps
  // last_reviewed_at, and that UPDATE bumps updated_at (row-version trigger), so
  // basing age on updated_at would reset the clock every run and hide genuine
  // graduate/kill candidates. created_at is stable across review stamps.
  const age = ageDays(flag.created_at, now);
  const disabledAging =
    flag.is_enabled === false &&
    lifecycle === 'disabled' &&
    age >= DISABLED_AGING_DAYS;
  const enabledNeverRolledOut =
    flag.is_enabled === true &&
    !flag.rolled_out_at &&
    age >= ENABLED_UNROLLED_DAYS;

  if (neverReviewed) reasons.push('never-reviewed');
  if (pastExpiry) reasons.push('past-expiry');
  if (disabledAging) reasons.push('disabled-aging');
  if (enabledNeverRolledOut) reasons.push('enabled-never-rolled-out');

  if (reasons.length === 0) return null;

  // Recommendation precedence: an expired flag should be killed/extended; an
  // enabled-unrolled flag should graduate; an aging-disabled flag should be
  // killed; otherwise it just needs a human review.
  let recommendation;
  if (pastExpiry) recommendation = 'extend'; // operator extends expiry_at or kills explicitly
  else if (disabledAging) recommendation = 'kill';
  else if (enabledNeverRolledOut) recommendation = 'graduate';
  else recommendation = 'review';

  return {
    flag_key: flag.flag_key,
    lifecycle_state: lifecycle,
    is_enabled: !!flag.is_enabled,
    reasons,
    recommendation,
    detail: reasons.join(', ')
  };
}

/**
 * Compute the stale-flag set from a list of flags.
 * @param {Array<object>} flags - leo_feature_flags rows
 * @param {number} now - epoch ms
 * @returns {{stale: Array, total: number, byRecommendation: Record<string,number>}}
 */
export function computeStaleFlags(flags, now) {
  const stale = [];
  for (const f of flags || []) {
    const c = classifyFlag(f, now);
    if (c) stale.push(c);
  }
  const byRecommendation = stale.reduce((acc, s) => {
    acc[s.recommendation] = (acc[s.recommendation] || 0) + 1;
    return acc;
  }, {});
  return { stale, total: (flags || []).length, byRecommendation };
}

/**
 * Render the stale-flag digest as human-readable text. Always emits an explicit
 * line when there are zero stale flags (never empty/silent).
 * @param {{stale:Array, total:number, byRecommendation:object}} result
 * @returns {string}
 */
export function formatDigest(result) {
  const { stale, total, byRecommendation } = result;
  if (!stale.length) {
    return `STALE-FLAG DIGEST: 0 stale flags out of ${total} registered. All flags reviewed and current.`;
  }
  const lines = [
    `STALE-FLAG DIGEST: ${stale.length} stale flag(s) out of ${total} registered.`,
    `  Recommendations: ${Object.entries(byRecommendation).map(([k, v]) => `${k}=${v}`).join(' ')}`
  ];
  for (const s of stale) {
    lines.push(`  • ${s.flag_key} [${s.lifecycle_state}${s.is_enabled ? '/on' : '/off'}] — ${s.detail} → ${s.recommendation.toUpperCase()}`);
  }
  return lines.join('\n');
}
