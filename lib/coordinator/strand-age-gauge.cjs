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

// SD-LEO-INFRA-FOUR-AUDIT-CRITICAL-001 FR-3: strategic_directives_v2.updated_at/created_at
// and sd_phase_handoffs.resolved_at are read here; updated_at/created_at are tz-naive columns
// (resolved_at is already timestamptz). The prior local tsMs() used Date.parse() directly,
// which parses an offset-less string as LOCAL time and shifts age by the host's UTC offset.
// Route through the canonical normalizer instead of reimplementing a 4th hasTZ guard.
const { pgTimestampMs } = require('../time/pg-timestamp.cjs');

/** Default strand-visibility threshold: comfortably above recoverStrandedFinal's 5-min STRANDED_MIN_AGE_MS. */
const DEFAULT_THRESHOLD_MS = 10 * 60 * 1000;

function resolveThresholdMs(env) {
  env = env || process.env;
  const min = Number(env.STRAND_AGE_GAUGE_THRESHOLD_MIN);
  return Number.isFinite(min) && min > 0 ? min * 60 * 1000 : DEFAULT_THRESHOLD_MS;
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
    let ageSource = 'strand_entry';

    // QF-20260829-934: age must be measured from strand-ENTRY -- the accepted PLAN-TO-LEAD
    // handoff that actually flipped this SD to pending_approval/LEAD_FINAL (state-transitions.js)
    // -- never from updated_at. Any unrelated metadata write (e.g. a provenance stamp) silently
    // resets updated_at and launders a long strand into an apparently-fresh one.
    const { data: entryHandoffs } = await supabase
      .from('sd_phase_handoffs')
      .select('accepted_at, created_at')
      .eq('sd_id', sd.id)
      .eq('handoff_type', 'PLAN-TO-LEAD')
      .eq('status', 'accepted')
      .order('created_at', { ascending: false })
      .limit(1);
    const entryMs = pgTimestampMs(entryHandoffs?.[0]?.accepted_at ?? entryHandoffs?.[0]?.created_at);

    if (Number.isFinite(entryMs)) {
      ageMs = nowMs - entryMs;
    } else {
      // No accepted PLAN-TO-LEAD handoff found (e.g. pre-dates this handoff table's adoption)
      // -- fall back to the prior updated_at/created_at heuristic rather than dropping the row.
      const updatedMs = pgTimestampMs(sd.updated_at);
      const createdMs = pgTimestampMs(sd.created_at);
      // pgTimestampMs() returns NaN (not null) for unparseable input, so the guard must use
      // Number.isFinite() — a `!== null` check would pass NaN through silently.
      const updatedLooksReliable = Number.isFinite(updatedMs) && (!Number.isFinite(createdMs) || updatedMs >= createdMs);
      if (updatedLooksReliable) {
        ageMs = nowMs - updatedMs;
        ageSource = 'updated_at_fallback';
      } else if (Number.isFinite(createdMs)) {
        ageMs = nowMs - createdMs;
        ageSource = 'created_at_fallback';
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
