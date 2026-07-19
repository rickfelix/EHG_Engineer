/**
 * @wire-check-exempt: loaded via a lazy require() inside scripts/fleet-dashboard.cjs's
 * printStrandAgeGauge() — mirrors this file's sibling gauge modules (relay-drop-gauge.cjs,
 * chairman-directive-gauge.cjs), none of which are traced as reachable either because
 * fleet-dashboard.cjs itself has no package.json script entry point (pre-existing gap,
 * out of this SD's scope).
 *
 * Strand-age gauge: pending_approval/LEAD_FINAL age, visible on the fleet dashboard.
 *
 * SD-LEO-INFRA-ADOPTED-RESUME-FINAL-001 (FR-2).
 *
 * An SD stuck at status=pending_approval/current_phase=LEAD_FINAL is one handoff
 * from shipped, but invisible to monitoring until this gauge — the coordinator
 * found the MarketLens specimen (4 successive holders, 2.5+ hours) by hand. Mirrors
 * the pure-core + read-only SHAPE of lib/coordinator/relay-drop-gauge.cjs. Age is
 * computed from `updated_at`; when that looks unreliable (older than the row's own
 * `created_at`, i.e. never touched, or simply absent) falls back to the SD's latest
 * `sd_phase_handoffs.resolved_at` — a live handoff row is a more trustworthy "last
 * touched" signal than a trigger-dependent `updated_at` column.
 *
 * CommonJS (.cjs) so fleet-dashboard.cjs (also .cjs) can require() it directly.
 *
 * @module lib/coordinator/strand-age-gauge
 */

'use strict';

/** Default strand-visibility threshold: comfortably above recoverStrandedFinal's 5-min STRANDED_MIN_AGE_MS. */
const DEFAULT_THRESHOLD_MS = 10 * 60 * 1000;

function resolveThresholdMs(env) {
  env = env || process.env;
  const min = Number(env.STRAND_AGE_GAUGE_THRESHOLD_MIN);
  return Number.isFinite(min) && min > 0 ? min * 60 * 1000 : DEFAULT_THRESHOLD_MS;
}

function tsMs(ts) {
  if (!ts) return null;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Read-only: query pending_approval/LEAD_FINAL SDs and flag any older than the
 * threshold. Never mutates strategic_directives_v2 or claiming_session_id.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ thresholdMs?: number, nowMs?: number }} [opts]
 * @returns {Promise<{ thresholdMs: number, rows: Array<{sd_key: string, ageMs: number, ageSource: string}>, flagged: Array }>}
 */
async function planStrandAgeGauge(supabase, opts = {}) {
  const thresholdMs = opts.thresholdMs ?? resolveThresholdMs();
  const nowMs = opts.nowMs ?? Date.now();

  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6: every candidate row is aged/flagged —
  // paginate past the PostgREST 1000-row cap. Fail-open empty-result policy preserved
  // (fetchAllPaginated throws → caught below).
  let candidates = null;
  try {
    const { fetchAllPaginated } = await import('../db/fetch-all-paginated.mjs');
    candidates = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('sd_key, id, updated_at, created_at')
      .eq('status', 'pending_approval')
      .eq('current_phase', 'LEAD_FINAL')
      .order('sd_key')); // unique-key tiebreaker for stable pagination
  } catch { candidates = null; }

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { thresholdMs, rows: [], flagged: [] };
  }

  const rows = [];
  for (const sd of candidates) {
    let ageMs = null;
    let ageSource = 'updated_at';
    const updatedMs = tsMs(sd.updated_at);
    const createdMs = tsMs(sd.created_at);

    // updated_at looks unreliable when it's missing or predates created_at (never touched).
    const updatedLooksReliable = updatedMs !== null && (createdMs === null || updatedMs >= createdMs);

    if (updatedLooksReliable) {
      ageMs = nowMs - updatedMs;
    } else {
      // Fall back to the latest handoff's resolved_at for this SD.
      const { data: handoffs } = await supabase
        .from('sd_phase_handoffs')
        .select('resolved_at')
        .eq('sd_id', sd.id)
        .order('resolved_at', { ascending: false })
        .limit(1);
      const handoffMs = tsMs(handoffs?.[0]?.resolved_at);
      if (handoffMs !== null) {
        ageMs = nowMs - handoffMs;
        ageSource = 'latest_handoff_resolved_at';
      } else if (createdMs !== null) {
        ageMs = nowMs - createdMs;
        ageSource = 'created_at';
      }
    }

    if (ageMs !== null) {
      rows.push({ sd_key: sd.sd_key, ageMs, ageSource });
    }
  }

  const flagged = rows.filter((r) => r.ageMs >= thresholdMs).sort((a, b) => b.ageMs - a.ageMs);
  return { thresholdMs, rows, flagged };
}

function formatAge(ageMs) {
  const min = Math.floor(ageMs / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hr}h${remMin ? `${remMin}m` : ''}`;
}

module.exports = { planStrandAgeGauge, resolveThresholdMs, formatAge, DEFAULT_THRESHOLD_MS };
