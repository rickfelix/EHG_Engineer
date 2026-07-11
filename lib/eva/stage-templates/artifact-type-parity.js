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

/**
 * Parse the allowed value set out of a Postgres CHECK constraint definition
 * of the ANY (ARRAY[...]) shape (pg_get_constraintdef's output format).
 * @param {string} definition
 * @returns {Set<string>}
 */
export function parseCheckConstraintAllowedValues(definition) {
  const allowed = new Set();
  if (!definition) return allowed;
  for (const match of definition.matchAll(/'([a-zA-Z0-9_]+)'::text/g)) allowed.add(match[1]);
  return allowed;
}
