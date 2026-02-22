/**
 * Cross-Stage Contract Validator
 * SD-MAN-FEAT-CORRECTIVE-VISION-GAP-001: FR-002
 * SD-MAN-FEAT-CORRECTIVE-VISION-GAP-004: Schema validation enhancement
 * SD-MAN-FEAT-CORRECTIVE-VISION-GAP-010: Shape validation + venture progression
 *
 * Validates that all upstream stage artifacts exist and have valid schemas
 * before allowing a stage to execute or a venture to progress.
 */

import { createClient } from '@supabase/supabase-js';
import { ensureOutputSchema } from './stage-templates/output-schema-extractor.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Validate that all upstream contracts are satisfied for a target stage.
 *
 * @param {Object} options
 * @param {number} options.targetStage - Stage number to validate contracts for
 * @param {string} options.ventureId - Venture UUID
 * @param {number[]} [options.requiredStages] - Explicit upstream dependencies (overrides template lookup)
 * @param {Object} [options.supabase] - Supabase client override
 * @returns {Promise<Object>} Validation result
 */
export async function validateContracts(options = {}) {
  const {
    targetStage,
    ventureId,
    requiredStages: explicitStages,
    supabase: supabaseOverride,
  } = options;

  const startTime = Date.now();

  const supabase = supabaseOverride || createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Determine required upstream stages
  let requiredStages = explicitStages || [];

  // If no explicit stages, derive from sequential dependency (stage N-1)
  // and known cross-stage patterns
  if (requiredStages.length === 0 && targetStage > 1) {
    requiredStages = [targetStage - 1]; // Minimum: previous stage

    // Add known multi-stage dependencies from lifecycle design
    const CROSS_STAGE_DEPS = {
      3: [1, 2],         // Kill gate: needs idea + validation
      5: [1, 3, 4],      // Kill gate: needs idea + market + competitor
      8: [1, 2, 3, 4, 5, 6, 7], // BMC: synthesizes all prior
      9: [1, 5, 8],      // Reality gate: needs idea + financial + BMC
      13: [1, 5, 9, 10, 11, 12], // Kill gate: needs full identity
      16: [1, 5, 7, 13, 14, 15], // P&L: needs pricing + planning
      22: [17, 18, 19, 20, 21], // UAT: needs full build
      25: [22, 23, 24],  // Ops review: needs launch data
    };

    if (CROSS_STAGE_DEPS[targetStage]) {
      requiredStages = CROSS_STAGE_DEPS[targetStage];
    }
  }

  if (requiredStages.length === 0) {
    return {
      passed: true,
      targetStage,
      ventureId,
      requiredStages: [],
      satisfiedContracts: [],
      missingContracts: [],
      latencyMs: Date.now() - startTime,
    };
  }

  // Fetch existing artifacts for required stages
  const { data: artifacts, error } = await supabase
    .from('venture_artifacts')
    .select('lifecycle_stage, artifact_type, is_current, created_at')
    .eq('venture_id', ventureId)
    .eq('is_current', true)
    .in('lifecycle_stage', requiredStages);

  if (error) throw new Error(`Contract validation query failed: ${error.message}`);

  const existingStages = new Set((artifacts || []).map(a => a.lifecycle_stage));

  const satisfiedContracts = requiredStages
    .filter(s => existingStages.has(s))
    .map(s => {
      const artifact = artifacts.find(a => a.lifecycle_stage === s);
      return {
        stage: s,
        artifactType: artifact?.artifact_type,
        createdAt: artifact?.created_at,
      };
    });

  const missingContracts = requiredStages
    .filter(s => !existingStages.has(s))
    .map(s => ({
      stage: s,
      reason: `No current artifact found for stage ${s}`,
    }));

  const result = {
    passed: missingContracts.length === 0,
    targetStage,
    ventureId,
    requiredStages,
    satisfiedContracts,
    missingContracts,
    latencyMs: Date.now() - startTime,
  };

  // SD-MAN-INFRA-CORRECTIVE-ARCHITECTURE-GAP-007: Emit contract validation event
  if (ventureId) {
    try {
      await supabase.from('eva_orchestration_events').insert({
        event_type: 'contract_validation_completed',
        event_source: 'contract_validator',
        venture_id: ventureId,
        event_data: {
          target_stage: targetStage,
          passed: result.passed,
          satisfied_count: satisfiedContracts.length,
          missing_count: missingContracts.length,
          latency_ms: result.latencyMs,
        },
        chairman_flagged: false,
      });
    } catch (_eventErr) {
      // Non-blocking
    }
  }

  return result;
}

/**
 * Validate artifact data shape against a template's outputSchema.
 * Returns an array of violations — empty array means the artifact conforms.
 *
 * SD-MAN-FEAT-CORRECTIVE-VISION-GAP-010: FR-002
 *
 * @param {Object} artifactData - JSONB artifact data from venture_artifacts
 * @param {Array<{field: string, type: string, required: boolean}>} outputSchema - Template outputSchema
 * @returns {Array<{field: string, expected: string, actual: string, violation: string}>}
 */
export function validateSchemaShape(artifactData, outputSchema) {
  if (!outputSchema || !Array.isArray(outputSchema) || outputSchema.length === 0) {
    return [];
  }

  if (!artifactData || typeof artifactData !== 'object') {
    return outputSchema
      .filter(entry => entry.required)
      .map(entry => ({
        field: entry.field,
        expected: entry.type,
        actual: 'missing',
        violation: 'missing_required_field',
      }));
  }

  const violations = [];

  for (const entry of outputSchema) {
    const value = artifactData[entry.field];
    const isMissing = value === undefined || value === null;

    if (isMissing && entry.required) {
      violations.push({
        field: entry.field,
        expected: entry.type,
        actual: 'missing',
        violation: 'missing_required_field',
      });
    } else if (!isMissing && entry.type !== 'any') {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== entry.type) {
        violations.push({
          field: entry.field,
          expected: entry.type,
          actual: actualType,
          violation: 'type_mismatch',
        });
      }
    }
  }

  return violations;
}

/**
 * Query lifecycle stage completion data for a venture.
 * Returns per-stage artifact counts grouped by lifecycle_stage.
 *
 * SD-MAN-FEAT-CORRECTIVE-VISION-GAP-010: FR-004
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @returns {Promise<{stages: Array<{stage: number, artifactCount: number, validated: boolean}>, totalStages: number, completedStages: number, error?: boolean}>}
 */
export async function getVentureProgression(supabase, ventureId) {
  try {
    const { data, error } = await supabase
      .from('venture_artifacts')
      .select('lifecycle_stage, is_current')
      .eq('venture_id', ventureId)
      .eq('is_current', true)
      .limit(100);

    if (error) {
      return { stages: [], totalStages: 8, completedStages: 0, error: true };
    }

    const stageMap = new Map();
    for (const artifact of (data || [])) {
      const stage = artifact.lifecycle_stage;
      if (!stageMap.has(stage)) {
        stageMap.set(stage, { artifactCount: 0 });
      }
      stageMap.get(stage).artifactCount++;
    }

    const stages = [];
    for (const [stage, info] of stageMap.entries()) {
      stages.push({
        stage,
        artifactCount: info.artifactCount,
        validated: info.artifactCount > 0,
      });
    }

    stages.sort((a, b) => a.stage - b.stage);

    return {
      stages,
      totalStages: 8,
      completedStages: stages.filter(s => s.validated).length,
    };
  } catch (_err) {
    return { stages: [], totalStages: 8, completedStages: 0, error: true };
  }
}
