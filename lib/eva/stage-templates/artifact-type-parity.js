/**
 * ARTIFACT_TYPES registry <-> venture_artifacts CHECK constraint parity.
 * SD-LEO-FIX-VENTURE-ARTIFACTS-ARTIFACT-001.
 *
 * lib/eva/artifact-types.js is the declared single source of truth stage
 * templates must emit values from — but nothing previously verified that
 * registry stayed in sync with the LIVE venture_artifacts_artifact_type_check
 * CHECK constraint. A registry value the constraint doesn't allow fails
 * writeArtifact at RUNTIME, mid-venture, with the orchestrator marking the
 * venture failed (the exact incident this SD fixes: 'blueprint_user_journey',
 * registered here but missing from the constraint). Pure/offline so it can
 * run in CI against the committed database/schema-reference-snapshot.json.
 */
import { readFileSync } from 'node:fs';

/**
 * Parse the allowed value set out of a Postgres CHECK constraint definition
 * of the flat `col = ANY (ARRAY['a'::text, 'b'::text, ...])` shape
 * (pg_get_constraintdef's output format) — the shape venture_artifacts_
 * artifact_type_check uses. NOT a general-purpose CHECK parser: only matches
 * ::text-cast literals (a ::character varying-cast column, e.g. from an
 * ARRAY[...]::text[] cast, returns an empty Set, not an error — verify the
 * target constraint's cast before reusing this on a different table), and
 * has no awareness of compound/conditional CHECK bodies (multiple ANY()
 * clauses combined with AND/OR would flatten into one bogus set).
 * @param {string} definition
 * @returns {Set<string>}
 */
export function parseCheckConstraintAllowedValues(definition) {
  const allowed = new Set();
  if (!definition) return allowed;
  for (const match of definition.matchAll(/'([a-zA-Z0-9_]+)'::text/g)) allowed.add(match[1]);
  return allowed;
}

/**
 * Load database/artifact-type-parity-pending-chairman-gate.json — the
 * reason-required allowlist of ARTIFACT_TYPES values registered in code
 * ahead of their chairman-gated widening migration being applied (mirrors
 * scripts/check-migration-readiness.mjs's requires_chairman_apply
 * convention). SD-LEO-FIX-REGISTER-STAGE-REFINED-001.
 * @param {string} [path]
 * @returns {Record<string, {reason: string, migration?: string}>}
 */
export function loadPendingChairmanGateAllowlist(path) {
  const target = path ?? new URL('../../../database/artifact-type-parity-pending-chairman-gate.json', import.meta.url);
  let raw;
  try {
    raw = readFileSync(target, 'utf8');
  } catch {
    return {};
  }
  const json = JSON.parse(raw);
  const entries = json.allow || {};
  for (const [value, entry] of Object.entries(entries)) {
    if (!entry || typeof entry.reason !== 'string' || !entry.reason.trim()) {
      throw new Error(`artifact-type-parity-pending-chairman-gate.json entry '${value}' must have a non-empty reason`);
    }
  }
  return entries;
}
