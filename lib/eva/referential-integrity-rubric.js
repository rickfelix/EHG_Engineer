/**
 * Referential Integrity Rubric
 *
 * SD-LEO-INFRA-BRIDGE-ARTIFACT-ENRICHMENT-001
 *
 * Post-creation validation for SD artifact references.
 * Checks:
 * 1. Every artifact_reference resolves to a real row in venture_artifacts
 * 2. Artifact type matches SD layer per mapping table rules
 * 3. Venture identity (id, name, target_application) is consistent across hierarchy
 * 4. No SD is missing required references that exist in the pipeline
 *
 * @module lib/eva/referential-integrity-rubric
 */

import { resolveArtifactsForSD, getMappedArtifactTypes } from './artifact-mapping-resolver.js';

/**
 * Validate referential integrity for a set of enriched SDs.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {string} params.ventureName - Venture name
 * @param {Object[]} params.sdRecords - Array of SD records with metadata.artifact_references
 * @param {Object[]} params.artifacts - venture_artifacts rows for this venture
 * @param {Object} params.mapping - Artifact mapping config
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger
 * @returns {Promise<Object>} { passed, score, checks, failures }
 */
export async function validateIntegrity(supabase, params, options = {}) {
  const { ventureId, ventureName, sdRecords, artifacts, mapping } = params;
  const { logger = console } = options;

  const checks = [];
  const failures = [];

  // Build lookup maps
  const artifactById = new Map();
  const artifactsByType = new Map();
  for (const art of artifacts) {
    artifactById.set(art.id, art);
    if (!artifactsByType.has(art.artifact_type)) {
      artifactsByType.set(art.artifact_type, []);
    }
    artifactsByType.get(art.artifact_type).push(art);
  }

  for (const sd of sdRecords) {
    const refs = sd.metadata?.artifact_references || [];
    const sdLayer = sd.metadata?.architecture_layer || 'data';

    // Check 1: Every reference resolves to a real artifact
    for (const ref of refs) {
      const exists = artifactById.has(ref.artifact_id);
      const check = {
        sd_key: sd.sd_key,
        check: 'reference_resolves',
        artifact_type: ref.artifact_type,
        artifact_id: ref.artifact_id,
        passed: exists,
      };
      checks.push(check);
      if (!exists) {
        failures.push({
          sd_key: sd.sd_key,
          check: 'reference_resolves',
          message: `Dead reference: artifact_id ${ref.artifact_id} (${ref.artifact_type}) does not exist in venture_artifacts`,
        });
      }
    }

    // Check 2: Artifact type matches mapping for this SD layer
    for (const ref of refs) {
      const resolved = resolveArtifactsForSD(mapping, sdLayer, artifacts);
      const validTypes = new Set([
        ...resolved.required.map(a => a.artifact_type),
        ...resolved.supplemental.map(a => a.artifact_type),
      ]);

      const typeValid = validTypes.has(ref.artifact_type);
      checks.push({
        sd_key: sd.sd_key,
        check: 'type_matches_mapping',
        artifact_type: ref.artifact_type,
        sd_layer: sdLayer,
        passed: typeValid,
      });

      if (!typeValid) {
        failures.push({
          sd_key: sd.sd_key,
          check: 'type_matches_mapping',
          message: `Type mismatch: ${ref.artifact_type} is not mapped to layer "${sdLayer}" for this venture type`,
        });
      }
    }

    // Check 3: Venture identity consistency
    const sdVentureId = sd.venture_id || sd.metadata?.venture_id;
    if (sdVentureId && sdVentureId !== ventureId) {
      failures.push({
        sd_key: sd.sd_key,
        check: 'venture_identity',
        message: `Venture ID mismatch: SD has ${sdVentureId}, expected ${ventureId}`,
      });
    }
    checks.push({
      sd_key: sd.sd_key,
      check: 'venture_identity',
      passed: !sdVentureId || sdVentureId === ventureId,
    });

    // Check 4: Missing required references
    const resolved = resolveArtifactsForSD(mapping, sdLayer, artifacts);
    for (const missing of resolved.missing) {
      failures.push({
        sd_key: sd.sd_key,
        check: 'required_reference_missing',
        message: `Required artifact ${missing.artifact_type} (${missing.classification}) exists in pipeline but not referenced by SD`,
      });
    }
    checks.push({
      sd_key: sd.sd_key,
      check: 'required_completeness',
      passed: resolved.missing.length === 0,
      missing_count: resolved.missing.length,
    });
  }

  const totalChecks = checks.length;
  const passedChecks = checks.filter(c => c.passed).length;
  const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100;
  const passed = failures.length === 0;

  if (!passed) {
    logger.warn(`[IntegrityRubric] FAILED: ${failures.length} issue(s) found across ${sdRecords.length} SDs`);
    for (const f of failures) {
      logger.warn(`  [${f.sd_key}] ${f.check}: ${f.message}`);
    }
  } else {
    logger.log(`[IntegrityRubric] PASSED: ${totalChecks} checks, score ${score}/100`);
  }

  return { passed, score, checks, failures };
}
