/**
 * SD-LEO-FIX-VENTURE-ARTIFACTS-ARTIFACT-001 — CI parity: every value in
 * lib/eva/artifact-types.js's ARTIFACT_TYPES registry (the declared single
 * source of truth stage templates must emit) must be allowed by the LIVE
 * venture_artifacts_artifact_type_check CHECK constraint. Offline: reads the
 * committed database/schema-reference-snapshot.json, no DB access in CI.
 *
 * Incident: stage-15 emitted ARTIFACT_TYPES.BLUEPRINT_USER_JOURNEY
 * ('blueprint_user_journey'), registered here since it was added to the
 * registry, but the constraint was never widened to match — writeArtifact
 * failed 4x and the orchestrator marked the venture FAILED at stage 15.
 * This test makes that class of drift fail CI instead of failing in prod.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ARTIFACT_TYPES } from '../../../lib/eva/artifact-types.js';
import { parseCheckConstraintAllowedValues } from '../../../lib/eva/stage-templates/artifact-type-parity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(__dirname, '../../../database/schema-reference-snapshot.json');
const CONSTRAINT_KEY = 'venture_artifacts.venture_artifacts_artifact_type_check';

describe('parseCheckConstraintAllowedValues (pure)', () => {
  it('extracts the quoted ::text values out of a pg_get_constraintdef ANY(ARRAY[...]) definition', () => {
    const def = "CHECK (((artifact_type)::text = ANY (ARRAY['a'::text, 'b_c'::text])))";
    expect(parseCheckConstraintAllowedValues(def)).toEqual(new Set(['a', 'b_c']));
  });

  it('returns an empty set for a missing/empty definition', () => {
    expect(parseCheckConstraintAllowedValues(null)).toEqual(new Set());
    expect(parseCheckConstraintAllowedValues('')).toEqual(new Set());
  });
});

describe('ARTIFACT_TYPES registry <-> venture_artifacts CHECK constraint parity', () => {
  it('every canonical ARTIFACT_TYPES value is allowed by the live constraint (committed snapshot)', () => {
    const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
    const definition = snapshot.checks && snapshot.checks[CONSTRAINT_KEY];
    expect(definition, `${CONSTRAINT_KEY} missing from database/schema-reference-snapshot.json — regenerate via: npm run schema:snapshot:lint`).toBeTruthy();

    const allowed = parseCheckConstraintAllowedValues(definition);
    const drifted = Object.values(ARTIFACT_TYPES).filter((v) => !allowed.has(v));

    expect(drifted, `ARTIFACT_TYPES values missing from the live constraint (add via a chairman-gated migration, then npm run schema:snapshot:lint): ${drifted.join(', ')}`).toEqual([]);
  });
});
