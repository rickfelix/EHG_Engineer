/**
 * Award-library design influence sampler.
 * SD-LEO-FEAT-CLOSE-DISTINCTIVENESS-GAP-001 (FR-1).
 *
 * Feeds the 137-site Awwwards design_reference_library (today consumed only by Stage-15
 * wireframes) into DESIGN AUTHORING as a blended, PARTIAL token influence — per the
 * chairman-refined direction:
 *  - INTELLIGENT RANDOMNESS: sampling is WEIGHTED toward the venture's archetype but
 *    deliberately allows cross-archetype picks, seeded PER VENTURE (deterministic hash of
 *    ventureId) so one venture reproduces its mix while ventures diverge from each other.
 *  - PARTIAL LEVERAGE: each of the 7 token DIMENSIONS may come from a DIFFERENT site;
 *    the result is framed as a minority influence blended with brand genome + subject —
 *    never a wholesale template.
 *  - FAIL-SOFT: any error / empty library returns null; generation never blocks on this.
 *
 * @module lib/eva/bridge/design-reference-sampler
 */

/** The 7 extracted token dimensions every library row carries. */
export const TOKEN_DIMENSIONS = [
  'color_strategy',
  'layout_pattern',
  'spacing_system',
  'visual_density',
  'interaction_style',
  'narrative_approach',
  'typography_hierarchy',
];

/** Share of dimension picks drawn from the archetype-matched pool (rest go cross-archetype). */
const ARCHETYPE_BIAS = 0.7;

/** FNV-1a 32-bit — deterministic seed from the venture id (no Date/unseeded random anywhere). */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  const s = String(str || 'default');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — tiny seeded PRNG, plenty for sampling. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pure blend: given library rows + a seed string + the venture archetype, pick a source site
 * PER DIMENSION (archetype-biased, deliberately cross-archetype for a minority of picks) and
 * return the influence object. Exported pure for unit tests.
 *
 * @param {Array<{site_name:string, archetype_category:string, design_tokens:object}>} rows
 * @param {{ seedStr: string, archetype?: string|null }} opts
 * @returns {object|null} { seed, archetype, dimensions: {dim: {influence, source_site, source_archetype}} }
 */
export function blendInfluence(rows, { seedStr, archetype = null }) {
  const usable = (Array.isArray(rows) ? rows : []).filter(
    (r) => r && r.design_tokens && typeof r.design_tokens === 'object'
  );
  if (!usable.length) return null;

  const rand = mulberry32(hashSeed(seedStr));
  const matched = archetype ? usable.filter((r) => r.archetype_category === archetype) : [];
  const cross = archetype ? usable.filter((r) => r.archetype_category !== archetype) : usable;

  const dimensions = {};
  let crossPicks = 0;
  for (const dim of TOKEN_DIMENSIONS) {
    // Bias toward the archetype pool, but deliberately allow cross-archetype picks.
    const preferCross = !matched.length || rand() > ARCHETYPE_BIAS;
    let pool = preferCross && cross.length ? cross : (matched.length ? matched : cross);
    // Only sites that actually carry this dimension.
    const withDim = pool.filter((r) => typeof r.design_tokens[dim] === 'string' && r.design_tokens[dim].trim());
    const fallbackPool = usable.filter((r) => typeof r.design_tokens[dim] === 'string' && r.design_tokens[dim].trim());
    pool = withDim.length ? withDim : fallbackPool;
    if (!pool.length) continue;
    const pick = pool[Math.floor(rand() * pool.length)];
    if (archetype && pick.archetype_category !== archetype) crossPicks++;
    dimensions[dim] = {
      influence: pick.design_tokens[dim].trim(),
      source_site: pick.site_name,
      source_archetype: pick.archetype_category,
    };
  }
  if (!Object.keys(dimensions).length) return null;

  // Guarantee the deliberate cross-archetype minority when an archetype pool exists:
  // if every pick landed in-archetype, re-pick ONE dimension from the cross pool (seeded).
  if (archetype && matched.length && cross.length && crossPicks === 0) {
    const dims = Object.keys(dimensions);
    const dim = dims[Math.floor(rand() * dims.length)];
    const pool = cross.filter((r) => typeof r.design_tokens[dim] === 'string' && r.design_tokens[dim].trim());
    if (pool.length) {
      const pick = pool[Math.floor(rand() * pool.length)];
      dimensions[dim] = {
        influence: pick.design_tokens[dim].trim(),
        source_site: pick.site_name,
        source_archetype: pick.archetype_category,
      };
    }
  }

  return { seed: hashSeed(seedStr), archetype: archetype || null, dimensions };
}

/**
 * DB-backed entry point. FAIL-SOFT by contract: returns null on any error, empty library,
 * or missing supabase — callers render nothing and generation proceeds.
 *
 * @param {{ ventureId: string, archetype?: string|null, supabase: object }} params
 * @returns {Promise<object|null>}
 */
export async function sampleDesignInfluence({ ventureId, archetype = null, supabase }) {
  try {
    if (!supabase || !ventureId) return null;
    const { data, error } = await supabase
      .from('design_reference_library')
      .select('site_name, archetype_category, design_tokens');
    if (error || !data?.length) return null;
    return blendInfluence(data, { seedStr: String(ventureId), archetype });
  } catch {
    return null;
  }
}
