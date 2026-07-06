/**
 * Canonical status-aware venture-by-name resolver for CLI/script callers.
 *
 * Distinct from lib/venture-resolver.js::getVentureConfigAsync (the routing-critical
 * resolver used by sd-router.js, which returns a full venture config object and is
 * out of scope here). This is a lightweight helper for scripts that just need to
 * resolve a venture ID from a name string without accidentally landing on a
 * cancelled duplicate when a live (active/paused) venture shares the same name.
 *
 * A venture-by-name lookup with no status filter is order-dependent: Postgres does
 * not guarantee row order without an ORDER BY, so which of several same-named rows
 * comes back is arbitrary. Four ventures (as of 2026-07-06) have exactly this shape
 * -- one active + N cancelled sharing a name (e.g. MarketLens: active ecbba50e,
 * cancelled 4e710bb2) -- so an unfiltered lookup can silently resolve to the wrong
 * (cancelled) row. This resolver always prefers a live (active/paused) match, and
 * only falls back to any status (most-recent-first) when no live match exists --
 * preserving the ability to re-run a cancelled venture under its old name.
 *
 * SD-LEO-INFRA-VENTURE-NAME-UNIQUENESS-001 FR-2
 * @module lib/venture-name-resolver
 */

const LIVE_STATUSES = ['active', 'paused'];

/**
 * Resolve a venture by name, preferring a live (active/paused) match over a
 * cancelled/terminal one when both exist under the same name.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} name - Venture name to resolve
 * @param {object} [opts]
 * @param {boolean} [opts.partial=false] - Use substring (ILIKE %name%) matching instead of exact
 * @returns {Promise<{id: string, name: string, status: string}|null>} matched venture or null
 */
export async function resolveActiveVentureByName(supabase, name, opts = {}) {
  if (!name) return null;
  const { partial = false } = opts;
  const pattern = partial ? `%${name}%` : name;

  const { data: liveMatches, error: liveError } = await supabase
    .from('ventures')
    .select('id, name, status')
    .ilike('name', pattern)
    .in('status', LIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1);
  if (liveError) throw new Error(`[venture-name-resolver] live-status query error: ${liveError.message}`);
  if (liveMatches?.[0]) return liveMatches[0];

  // No live match -- fall back to any status (preserves re-run-under-old-name).
  const { data: anyMatches, error: anyError } = await supabase
    .from('ventures')
    .select('id, name, status')
    .ilike('name', pattern)
    .order('created_at', { ascending: false })
    .limit(1);
  if (anyError) throw new Error(`[venture-name-resolver] fallback query error: ${anyError.message}`);
  return anyMatches?.[0] ?? null;
}
