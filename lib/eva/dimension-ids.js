/**
 * Stable dimension identifiers for vision/architecture extracted_dimensions.
 * SD-LEO-INFRA-VISION-ARCHITECTURE-DIMENSION-001 (FR-1).
 *
 * extracted_dimensions[i] carries a .name but historically no id of its own —
 * every consumer of a "V04"/"A03"-style code has been deriving it purely from
 * array position, so the same code silently means a different dimension
 * whenever the array is re-extracted, reordered, or edited.
 *
 * This module is the single shared source for deriving/assigning a stable,
 * name-derived id. It does NOT change the positional id format used by the
 * persisted eva_vision_scores.dimension_scores surface (see vision-scorer.js)
 * — resolveDimensionIdentity returns both the positional id and the stable id
 * side by side so callers can choose which surface they belong to.
 *
 * @module lib/eva/dimension-ids
 */

// eva-logger-lint-ignore: pure functions, no side effects, no I/O -- nothing worth logging.

/**
 * Derive a stable, URL/key-safe slug from a dimension name.
 * @param {string} name
 * @returns {string}
 */
export function slugifyDimensionName(name) {
  const slug = String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'dim';
}

/**
 * Assign a stable .id to every dimension in `dimensions` that lacks one.
 *
 * - A dimension that already carries .id is passed through unchanged.
 * - A dimension whose .name matches an existing dimension's .name (from
 *   `existingDimensions`, typically the row's own prior extracted_dimensions)
 *   reuses that existing id — this is what lets re-extraction preserve ids
 *   for dimensions whose name did not change.
 * - Otherwise a fresh slug is derived from .name, disambiguated with a
 *   numeric suffix (-2, -3, ...) against every id already in use (existing
 *   ids + ids assigned earlier in this same call).
 *
 * @param {Array<{name:string, id?:string}>|null|undefined} dimensions
 * @param {Array<{name:string, id?:string}>} [existingDimensions]
 * @returns {Array<object>}
 */
export function assignDimensionIds(dimensions, existingDimensions = []) {
  if (!Array.isArray(dimensions)) return [];

  const existingByName = new Map();
  for (const d of existingDimensions || []) {
    if (d && typeof d.name === 'string' && typeof d.id === 'string' && d.id) {
      existingByName.set(d.name, d.id);
    }
  }

  // Tracks ids already claimed WITHIN THIS OUTPUT (not the full historical set of existing
  // ids) -- seeding this with every existing id would block the very reuse this function
  // exists to perform (the id we're about to reuse is, tautologically, already "existing").
  const usedIds = new Set();

  return dimensions.map((dim) => {
    if (dim && typeof dim.id === 'string' && dim.id) {
      usedIds.add(dim.id);
      return dim;
    }

    const name = dim?.name;
    const reused = existingByName.get(name);
    let id;
    if (reused && !usedIds.has(reused)) {
      id = reused;
    } else {
      const base = slugifyDimensionName(name);
      id = base;
      let suffix = 2;
      while (usedIds.has(id)) {
        id = `${base}-${suffix}`;
        suffix += 1;
      }
    }
    usedIds.add(id);
    return { ...dim, id };
  });
}

/**
 * Resolve a single dimension's identity for scoring purposes: the id_kind
 * distinguishes a persisted stable id from today's positional fallback.
 * Neither criterion.id (the persisted/positional surface) nor stableId
 * (the Surface-B/annotation companion) is changed by the other's presence.
 *
 * @param {{id?:string}} dim
 * @param {number} i - zero-based index within the array
 * @param {string} prefix - 'V' or 'A'
 * @returns {{positionalId:string, stableId:string|null, idKind:'stable'|'positional_fallback'}}
 */
export function resolveDimensionIdentity(dim, i, prefix) {
  const positionalId = `${prefix}${String(i + 1).padStart(2, '0')}`;
  const hasStableId = typeof dim?.id === 'string' && dim.id.length > 0;
  return {
    positionalId,
    stableId: hasStableId ? dim.id : null,
    idKind: hasStableId ? 'stable' : 'positional_fallback',
  };
}
