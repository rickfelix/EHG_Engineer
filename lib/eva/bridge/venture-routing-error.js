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
 * SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-B (PA-1, FR-B8)
 *   - VentureNotRegisteredError: PERMANENT — registry query succeeded but
 *     returned no row for a non-null venture name (validation C3 + C-SEC-8B).
 *   - VentureRegistryUnavailableError: TRANSIENT — registry query itself
 *     errored (Supabase outage, timeout). Per security-agent C-SEC-4: split
 *     prevents transient outages from permanently cancelling legitimate SDs.
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
 * Thrown when a non-null venture name is provided but the registry query
 * succeeds with no matching row. PERMANENT failure — caller should abort
 * the SD-creation transaction and surface a chairman-actionable error.
 *
 * Distinct from VentureRegistryUnavailableError (which is transient) so that
 * callers can branch on .code: retry on UNAVAILABLE, abort on NOT_REGISTERED.
 * Per security-agent C-SEC-4 (escalated to BLOCKING for Child B EXEC).
 *
 * SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-B / FR-B1 / FR-B8.
 */
export class VentureNotRegisteredError extends Error {
  /**
   * @param {Object} args
   * @param {string} args.attemptedName - The venture name that failed lookup
   * @param {Object} [args.sd_context] - Optional { sd_id, phase } for traceability
   * @param {string} [args.resolution_hint] - Suggested chairman action
   */
  constructor({ attemptedName, sd_context = null, resolution_hint = null }) {
    super(
      `Venture "${attemptedName}" not in registry. Add to applications/registry.json AND ` +
      `populate ventures.repo_url before Stage 19, OR rename the venture to match an existing ` +
      `registered name.`
    );
    this.name = 'VentureNotRegisteredError';
    this.code = 'VENTURE_NOT_REGISTERED';
    this.attemptedName = attemptedName;
    this.sd_context = sd_context;
    this.resolution_hint =
      resolution_hint ||
      'Register the venture in the database (ventures + venture_resources) and rerun SD creation.';
    this.occurred_at = new Date().toISOString();
  }
}

/**
 * Thrown when the registry query itself fails (Supabase error, timeout,
 * network glitch). TRANSIENT failure — caller should retry with backoff.
 *
 * Distinct from VentureNotRegisteredError so transient outages don't cause
 * permanent SD cancellations.
 *
 * SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-B / FR-B1 / FR-B8.
 */
export class VentureRegistryUnavailableError extends Error {
  /**
   * @param {Object} args
   * @param {string} args.attemptedName - The venture name that was being looked up
   * @param {Error|Object} [args.underlyingError] - The Supabase error for diagnosis
   * @param {string} [args.resolution_hint]
   */
  constructor({ attemptedName, underlyingError = null, resolution_hint = null }) {
    const detail = underlyingError?.message || 'unknown registry query failure';
    super(
      `Venture registry unavailable for lookup of "${attemptedName}": ${detail}. ` +
      `This is a transient failure — retry with exponential backoff.`
    );
    this.name = 'VentureRegistryUnavailableError';
    this.code = 'VENTURE_REGISTRY_UNAVAILABLE';
    this.attemptedName = attemptedName;
    this.underlyingError = underlyingError;
    this.resolution_hint = resolution_hint || 'Retry the SD-creation flow with exponential backoff.';
    this.occurred_at = new Date().toISOString();
  }
}

/**
 * Apply NFKD + combining-mark strip + lowercase + alphanumeric strip.
 *
 * Single source of truth for the normalization rule used across:
 *   - lib/venture-resolver.js::getVentureConfig
 *   - database/migrations/20260505_083153_unique_idx_ventures_normalized_name.sql
 *   - database/migrations/20260505_083154_create_vw_venture_registry.sql
 *
 * Why NFKD (decomposed) instead of NFKC (composed):
 *   NFKC keeps 'é' as a single composed char, which strip-non-alphanumeric
 *   removes — meaning 'Café' and 'Cafe' would normalize to DIFFERENT keys
 *   ('caf' vs 'cafe'). An attacker registering 'CömmitCraft' would then
 *   bypass the collision detector against legit 'CommitCraft'. NFKD
 *   decomposes 'é' into 'e' + combining-acute (U+0301), which the combining-
 *   mark strip removes, leaving 'e'. Result: 'Café' → 'cafe' = 'Cafe' → 'cafe'.
 *   Per security-agent C-SEC-1 (homoglyph defense).
 *
 * Postgres equivalent:
 *   LOWER(REGEXP_REPLACE(REGEXP_REPLACE(NORMALIZE(name, NFKD),
 *                                       '[̀-ͯ]', '', 'g'),
 *                        '[^A-Za-z0-9]', '', 'g'))
 *
 * @param {string} name
 * @returns {string}
 */
export function normalizeVentureName(name) {
  if (typeof name !== 'string') return '';
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
