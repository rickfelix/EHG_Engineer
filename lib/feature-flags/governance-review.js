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
// SD-LEO-INFRA-MAKE-FEATURE-FLAGS-001: a flag shipped default-OFF (rolled_out_at set) that is
// STILL disabled and not yet decided (lifecycle_state='draft') this long after rollout is a
// FORGOTTEN switch — the "ship-it-off-and-forget" trap: automation that silently never runs.
// The review job must ESCALATE it (recommend ENABLE), not let it sit silently. We key on
// lifecycle='draft' (undecided) — a flag the operator has explicitly moved to 'disabled' is a
// deliberate decision handled by the disabled-aging → KILL path, not a forgotten one.
export const STALE_PENDING_OFF_DAYS = 7;
const DAY_MS = 24 * 3600 * 1000;

function ageDays(ts, now) {
  if (!ts) return Infinity;
  return (now - new Date(ts).getTime()) / DAY_MS;
}

/**
 * Classify a single flag's staleness. Returns null when the flag is healthy.
 * @param {object} flag - a leo_feature_flags row
 * @param {number} now - epoch ms (injected for testability)
 * @param {object} [opts] - { env, hasLiveReaders } — env: runtime snapshot for registry-vs-runtime
 *   drift detection (QF-20260610-863); hasLiveReaders(flagKey): optional predicate that returns
 *   true when the flag still has live code readers, so a KILL is downgraded to KEEP
 *   (QF-20260721-951). Both injected, never read globally (stays pure).
 * @returns {{flag_key:string, reasons:string[], recommendation:'enable'|'graduate'|'kill'|'keep'|'extend'|'review'|'reconcile', detail:string}|null}
 */
export function classifyFlag(flag, now, opts = {}) {
  const reasons = [];
  const lifecycle = flag.lifecycle_state;
  // Terminal states are intentionally settled — never "stale".
  if (lifecycle === 'archived' || lifecycle === 'expired') return null;

  // QF-20260610-863 (W0-3, FR-3): registry-vs-runtime drift. An ADAM_* row whose
  // registry says off/draft while the runtime env flag is ON means the loop is
  // live but the registry kill-switch disagrees — previously classified HEALTHY
  // (verified live for ADAM_GOVERNANCE_HEARTBEAT_V1). Surfaced with a RECONCILE
  // recommendation: promote the row (or kill the env) so the two agree.
  const envRaw = opts.env ? String(opts.env[flag.flag_key] || '').toLowerCase() : '';
  const envOn = envRaw === 'on' || envRaw === '1' || envRaw === 'true';
  const registryRuntimeDrift =
    String(flag.flag_key || '').startsWith('ADAM_') &&
    envOn &&
    (flag.is_enabled === false || lifecycle === 'draft');

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
  // Forgotten switch: shipped default-OFF (rolled_out_at set) but still disabled and still
  // undecided (lifecycle='draft') past the staleness window. Age is measured from rolled_out_at
  // (when the OFF rollout shipped), not created_at — the clock starts when it went live OFF.
  const staleOffPending =
    flag.is_enabled === false &&
    !!flag.rolled_out_at &&
    lifecycle === 'draft' &&
    ageDays(flag.rolled_out_at, now) >= STALE_PENDING_OFF_DAYS;

  if (registryRuntimeDrift) reasons.push('registry-runtime-drift');
  if (neverReviewed) reasons.push('never-reviewed');
  if (pastExpiry) reasons.push('past-expiry');
  if (disabledAging) reasons.push('disabled-aging');
  if (enabledNeverRolledOut) reasons.push('enabled-never-rolled-out');
  if (staleOffPending) reasons.push('stale-off-pending');

  if (reasons.length === 0) return null;

  // Recommendation precedence: an expired flag should be killed/extended; an
  // enabled-unrolled flag should graduate; an aging-disabled flag should be
  // killed; otherwise it just needs a human review.
  let recommendation;
  // Registry-vs-runtime drift outranks everything: the registry kill-switch is now
  // AUTHORITATIVE (QF-20260610-863), so a row disagreeing with the live runtime is
  // an active safety gap, not mere staleness.
  if (registryRuntimeDrift) {
    return {
      flag_key: flag.flag_key,
      lifecycle_state: lifecycle,
      is_enabled: !!flag.is_enabled,
      reasons,
      recommendation: 'reconcile',
      detail: `registry (${lifecycle}/${flag.is_enabled ? 'on' : 'off'}) disagrees with live runtime (env=on) — promote the row or kill the env so the authoritative gate is consistent`
    };
  }
  // A forgotten shipped-OFF switch is the most actionable signal — surface ENABLE first so the
  // coordinator/chairman sees the automation that is silently not running (the operator's
  // repeatedly-flagged "turn it off and forget" trap). Flipping it ON stays a deliberate action.
  if (staleOffPending) recommendation = 'enable';
  else if (pastExpiry) recommendation = 'extend'; // operator extends expiry_at or kills explicitly
  else if (disabledAging) recommendation = 'kill';
  else if (enabledNeverRolledOut) recommendation = 'graduate';
  else recommendation = 'review';

  // QF-20260721-951: a disabled-aging flag that STILL has live code readers is load-bearing,
  // not dead weight — killing it would strand callers (the false-KILL that fenced an SD). When
  // the injected reader-scan reports a live reader, downgrade KILL → KEEP. FAIL-SAFE: absent a
  // scanner we preserve legacy behavior; verify liveness against live READERS, not static STATE.
  if (recommendation === 'kill' && typeof opts.hasLiveReaders === 'function' && opts.hasLiveReaders(flag.flag_key)) {
    recommendation = 'keep';
    reasons.push('load-bearing (live readers)');
  }

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
export function computeStaleFlags(flags, now, opts = {}) {
  const stale = [];
  for (const f of flags || []) {
    const c = classifyFlag(f, now, opts);
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
