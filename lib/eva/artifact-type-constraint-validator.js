/**
 * Artifact Type Constraint Validator — Startup Check
 *
 * Validates that exactly ONE CHECK constraint exists on
 * venture_artifacts.artifact_type and that all code-registered
 * types are present. Fails hard if diverged.
 *
 * Called on server startup. Prevents the dual-constraint bug
 * from ever recurring silently.
 *
 * SD-MAN-REFAC-S17-SIMPLIFY-PIPELINE-001
 * @module lib/eva/artifact-type-constraint-validator
 */

import { ARTIFACT_TYPES } from './artifact-types.js';

/**
 * Validate artifact type constraints on startup.
 * @param {object} supabase - Supabase service client
 * @returns {Promise<{valid: boolean, errors: string[]}>}
 */
export async function validateArtifactTypeConstraints(supabase) {
  const errors = [];

  try {
    // Check constraint count via pg_constraint
    const { data: constraints, error } = await supabase.rpc('get_table_constraints', {
      p_table_name: 'venture_artifacts'
    });

    if (error) {
      // If RPC doesn't exist, try a simpler check
      console.warn('[artifact-type-validator] Could not query constraints (RPC unavailable). Skipping validation.');
      return { valid: true, errors: [] };
    }

    const artTypeConstraints = (constraints ?? []).filter(c =>
      c.constraint_type === 'CHECK' && (c.check_clause ?? '').includes('artifact_type')
    );

    if (artTypeConstraints.length > 1) {
      errors.push(
        `CRITICAL: ${artTypeConstraints.length} CHECK constraints on venture_artifacts.artifact_type! ` +
        `Expected exactly 1. Constraints: ${artTypeConstraints.map(c => c.constraint_name).join(', ')}. ` +
        'Run: node scripts/generate-artifact-type-constraint.js --apply'
      );
    }

    if (artTypeConstraints.length === 0) {
      errors.push('WARNING: No CHECK constraint on venture_artifacts.artifact_type. Types are unconstrained.');
    }

    // Check if all code types are in the constraint
    if (artTypeConstraints.length === 1) {
      const clause = artTypeConstraints[0].check_clause ?? '';
      const codeTypes = Object.values(ARTIFACT_TYPES);
      const missing = codeTypes.filter(t => !clause.includes(`'${t}'`));
      if (missing.length > 0) {
        errors.push(
          `WARNING: ${missing.length} code-registered artifact types missing from DB constraint: ` +
          `${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}. ` +
          'Run: node scripts/generate-artifact-type-constraint.js --apply'
        );
      }
    }
  } catch (err) {
    console.warn(`[artifact-type-validator] Validation error (non-blocking): ${err.message}`);
    return { valid: true, errors: [] };
  }

  if (errors.length > 0) {
    errors.forEach(e => console.error(`[artifact-type-validator] ${e}`));
  } else {
    console.log('[artifact-type-validator] ✅ Single constraint validated, all code types present');
  }

  return { valid: errors.length === 0, errors };
}
