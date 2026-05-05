/**
 * Structured error classes for the DB-derived venture registry.
 *
 * SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-A
 *   - VentureRegistryCollisionError: thrown when 2+ active ventures normalize
 *     to the same key (chairman resolves manually, per validation C5).
 *   - VentureRegistryInvalidNameError: thrown when normalize(name) produces
 *     empty or too-short output (per security-agent C-SEC-2 — prevents Unicode-
 *     only inputs from becoming structurally unaddressable).
 *
 * Sibling SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-B will add VentureRoutingError
 * to this file for the PA-1 fail-closed throw.
 *
 * @module lib/eva/bridge/venture-routing-error
 */

/**
 * Thrown when two or more registered ventures normalize to identical keys.
 * Chairman resolves manually by renaming or cancelling one of the candidates.
 *
 * Per validation C5 + security-agent C-SEC-3: each candidate retains its
 * ORIGINAL (pre-normalization) ventures.name so chairman can disambiguate
 * without further DB hits.
 */
export class VentureRegistryCollisionError extends Error {
  /**
   * @param {Object} args
   * @param {Array<Object>} args.candidates - Each: { id, name (ORIGINAL), normalized_name, status, repo_url, deployment_url, current_lifecycle_stage, created_at }
   * @param {string} args.normalizedKey - The colliding normalized key
   * @param {string} args.attemptedName - The original lookup input (pre-normalization)
   * @param {Object} [args.sd_context] - Optional { sd_id, phase } for traceability
   * @param {string} [args.resolution_hint] - Suggested chairman action
   */
  constructor({ candidates, normalizedKey, attemptedName, sd_context = null, resolution_hint = null }) {
    const candidateNames = candidates.map((c) => c.name).join(', ');
    super(
      `Venture registry collision: ${candidates.length} active ventures normalize to "${normalizedKey}" — ` +
      `[${candidateNames}]. Lookup attempted with name "${attemptedName}". Chairman must resolve by ` +
      `renaming or cancelling one of the candidates.`
    );
    this.name = 'VentureRegistryCollisionError';
    this.code = 'VENTURE_REGISTRY_COLLISION';
    this.candidates = candidates;
    this.normalizedKey = normalizedKey;
    this.attemptedName = attemptedName;
    this.sd_context = sd_context;
    this.resolution_hint =
      resolution_hint ||
      'Rename or cancel one of the colliding ventures via chairman governance flow, then retry the SD creation.';
    this.occurred_at = new Date().toISOString();
  }
}

/**
 * Thrown when normalize(name) produces an empty or too-short string.
 * Prevents Unicode-only or trivial inputs from becoming structurally
 * unaddressable in the registry. Per security-agent C-SEC-2.
 *
 * Examples that throw:
 *   - "😀" (no Latin alphanumerics after NFKC + strip)
 *   - "" (empty input)
 *   - "a" (1 char — below the 2-char minimum)
 *
 * Examples that pass (normalize successfully):
 *   - "Café" → "cafe" (NFKC normalization)
 *   - "CömmitCraft AI" → "commitcraftai" (after NFKC + strip)
 */
export class VentureRegistryInvalidNameError extends Error {
  /**
   * @param {Object} args
   * @param {string} args.attemptedName - The original input
   * @param {string} args.normalizedKey - The (empty/short) result
   * @param {'empty' | 'too_short'} args.reason
   */
  constructor({ attemptedName, normalizedKey, reason }) {
    super(
      `Venture registry invalid name: "${attemptedName}" normalized to "${normalizedKey}" (${reason}). ` +
      `Names must contain at least 2 alphanumeric characters after NFKC normalization.`
    );
    this.name = 'VentureRegistryInvalidNameError';
    this.code = 'VENTURE_REGISTRY_INVALID_NAME';
    this.attemptedName = attemptedName;
    this.normalizedKey = normalizedKey;
    this.reason = reason;
    this.occurred_at = new Date().toISOString();
  }
}

/**
 * Apply NFKC + lowercase + alphanumeric strip normalization.
 * Single source of truth for the normalization rule used across:
 *   - lib/venture-resolver.js::getVentureConfig
 *   - database/migrations/20260505_083153_unique_idx_ventures_normalized_name.sql
 *   - database/migrations/20260505_083154_create_vw_venture_registry.sql
 *
 * Postgres equivalent:
 *   LOWER(REGEXP_REPLACE(NORMALIZE(name, NFKC), '[^A-Za-z0-9]', '', 'g'))
 *
 * @param {string} name
 * @returns {string}
 */
export function normalizeVentureName(name) {
  if (typeof name !== 'string') return '';
  return name.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');
}
