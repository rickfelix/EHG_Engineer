// exec-email-alignment.mjs
// SD-LEO-INFRA-EXEC-EMAIL-STRATEGY-ALIGNED-001 (FR-2): the ALIGNMENT section of the chairman
// exec-summary email — the two mission-invariant pivot signals that CLAUDE_ADAM.md requires and
// that a v2 simplification dropped:
//   • META-TO-PRODUCT RATIO  (the taper gauge): harness/meta items vs product items, filed over a
//     window. Per THE TAPER RULE it must DECLINE toward solo-operator launch.
//   • DISTANCE-TO-QUIT (mission needle): current monthly venture net vs the chairman quit-threshold.
//     DORMANT until a real venture dollar lands (venture net ~0 today) — shown as an honest dormant
//     line, never a fabricated number.
//
// Pure + fail-soft: each line independently degrades to null on any error so the email never blocks.

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8: the ratio scans EVERY SD created
// in the window (default 30 days). At current fleet sourcing rates that plausibly exceeds the
// PostgREST 1000-row cap, which would silently skew the taper gauge toward whichever class
// sorts first. Paginate to completion; the fail-soft catch above each line is preserved.
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

const META_PREFIX = /^(SD-LEO-|SD-LEARN-FIX-|SD-MAN-INFRA-|QF-)/;

/** Classify an SD key as meta/harness (true) vs product/venture (false). */
export function isMetaSd(sdKey) {
  return META_PREFIX.test(String(sdKey || ''));
}

/**
 * Compute the meta-to-product ratio over a window from a list of SD rows ({ sd_key }).
 * Pure — the caller supplies the rows. Returns { meta, product, ratio, line } or null if no rows.
 */
export function computeMetaToProductRatio(sdRows, { windowDays = 30 } = {}) {
  const rows = Array.isArray(sdRows) ? sdRows : [];
  if (rows.length === 0) return null;
  let meta = 0, product = 0;
  for (const r of rows) (isMetaSd(r && r.sd_key) ? meta++ : product++);
  // ratio = meta per 1 product; product=0 → show meta count without a divide-by-zero.
  const ratio = product > 0 ? meta / product : null;
  const ratioStr = ratio == null ? `${meta} meta / 0 product` : `${ratio.toFixed(1)} : 1`;
  const line = `Meta-to-product ratio (last ${windowDays}d filed): ${ratioStr} (${meta} meta vs ${product} product) — taper target: declining`;
  return { meta, product, ratio, windowDays, line };
}

/**
 * Render the distance-to-quit line. The threshold is the chairman income-replacement amendment;
 * ventureNetMonthlyUsd is the realized monthly venture net (≈0 until a real dollar lands).
 * DORMANT semantics: with no realized venture income, show an honest "dormant — no venture income
 * yet" line rather than a fabricated distance. Returns a string or null (fail-soft).
 */
export function formatDistanceToQuitLine({ ventureNetMonthlyUsd, thresholdPresent } = {}) {
  if (!thresholdPresent) return null; // can't frame a distance without the chairman threshold
  const net = Number(ventureNetMonthlyUsd);
  if (!Number.isFinite(net) || net <= 0) {
    return 'Distance-to-quit: dormant — no realized venture income yet (activates when a real venture dollar lands)';
  }
  return `Distance-to-quit: ${net.toFixed(0)}/mo realized venture net vs the chairman quit-threshold`;
}

/**
 * Build both ALIGNMENT lines. `io` provides a supabase client; all DB access is fail-soft so a
 * failure on either line yields null for that line and never throws.
 * Returns { metaLine, distanceToQuitLine }.
 */
export async function computeAlignmentLines(io, { windowDays = 30, nowMs = null } = {}) {
  const db = io && io.supabase;
  let metaLine = null, distanceToQuitLine = null;

  // META-TO-PRODUCT RATIO
  try {
    const sinceMs = (typeof nowMs === 'number' ? nowMs : Date.parse(new Date().toISOString())) - windowDays * 24 * 3600 * 1000;
    const sinceIso = new Date(sinceMs).toISOString();
    const data = await fetchAllPaginated(() => db.from('strategic_directives_v2')
      .select('sd_key')
      .gte('created_at', sinceIso)
      .order('id', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)
    const r = computeMetaToProductRatio(data, { windowDays });
    metaLine = r && r.line;
  } catch { /* fail-soft */ }

  // DISTANCE-TO-QUIT
  try {
    const { data } = await db.from('strategic_directives_v2')
      .select('metadata').eq('sd_key', 'SD-LEO-ORCH-ADAM-PLAN-KEEPER-001').maybeSingle();
    const thresholdPresent = !!(data && data.metadata && data.metadata.chairman_amendment_2026_06_11_income_replacement);
    // Realized venture net is ~0 today (substrate is test-mode Stripe; venture_revenue_entries empty);
    // the line is dormant until a real dollar lands. Pass 0 so it renders the honest dormant state.
    distanceToQuitLine = formatDistanceToQuitLine({ ventureNetMonthlyUsd: 0, thresholdPresent });
  } catch { /* fail-soft */ }

  return { metaLine, distanceToQuitLine };
}
