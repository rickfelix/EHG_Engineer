/**
 * Stage Execution Engine
 * SD-MAN-FEAT-CORRECTIVE-VISION-GAP-001: FR-001
 *
 * Loads a stage template, invokes its analysisStep with upstream data,
 * validates output against schema, and persists the artifact.
 */

import { createSupabaseServiceClient } from '../supabase-client.js';
import { writeArtifact } from './artifact-persistence-service.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { stageRegistry } from './stage-registry.js';
import { CROSS_STAGE_DEPS, validatePreStage, validatePostStage, CONTRACT_ENFORCEMENT } from './contracts/stage-contracts.js';
import { waitForDecision } from './chairman-decision-watcher.js';
import { checkAutonomy } from './autonomy-model.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const STAGE_TEMPLATES_DIR = join(__dirname, 'stage-templates');

/**
 * Resolve EVA governance keys (vision_key, plan_key) for a venture at a given stage.
 * SD-LEO-INFRA-STREAM-VENTURE-EVA-002-C: FR-1, FR-2, FR-3
 *
 * Key generation rules:
 *   Stage 1: generates vision_key (VISION-{VENTURE_NAME}-L2-001)
 *   Stages 2-12: looks up existing vision_key from venture_artifacts
 *   Stage 13: generates plan_key (ARCH-{VENTURE_NAME}-001), carries vision_key
 *   Stages 14-15: looks up both vision_key and plan_key
 *   Stages 16+: not in scope (returns null)
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {number} stageNumber - Current lifecycle stage
 * @returns {Promise<{ visionKey: string|null, planKey: string|null }>}
 */
export async function resolveEvaKeys(supabase, ventureId, stageNumber) {
  if (stageNumber < 1 || stageNumber > 15) return { visionKey: null, planKey: null };

  let visionKey = null;
  let planKey = null;

  // Fetch venture name for key generation
  const { data: venture } = await supabase
    .from('ventures')
    .select('name')
    .eq('id', ventureId)
    .single();

  if (!venture?.name) return { visionKey: null, planKey: null };

  const safeName = venture.name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  if (stageNumber === 1) {
    // Stage 1: generate vision_key
    visionKey = `VISION-${safeName}-L2-001`;
  } else {
    // Stages 2+: look up existing vision_key from venture_artifacts
    const { data: existingVision } = await supabase
      .from('venture_artifacts')
      .select('supports_vision_key')
      .eq('venture_id', ventureId)
      .not('supports_vision_key', 'is', null)
      .eq('is_current', true)
      .order('lifecycle_stage', { ascending: true })
      .limit(1);

    visionKey = existingVision?.[0]?.supports_vision_key || `VISION-${safeName}-L2-001`;
  }

  if (stageNumber === 13) {
    // Stage 13: generate plan_key
    planKey = `ARCH-${safeName}-001`;
  } else if (stageNumber > 13) {
    // Stages 14-15: look up existing plan_key
    const { data: existingPlan } = await supabase
      .from('venture_artifacts')
      .select('supports_plan_key')
      .eq('venture_id', ventureId)
      .not('supports_plan_key', 'is', null)
      .eq('is_current', true)
      .order('lifecycle_stage', { ascending: true })
      .limit(1);

    planKey = existingPlan?.[0]?.supports_plan_key || `ARCH-${safeName}-001`;
  }

  return { visionKey, planKey };
}

/**
 * Ensure the StageRegistry is initialized with built-in stages.
 * Safe to call multiple times — idempotent.
 */
let _registryInitialized = false;
async function ensureRegistryInitialized() {
  if (_registryInitialized) return;
  if (!stageRegistry._initialized) {
    await stageRegistry.registerBuiltinStages();
  }
  _registryInitialized = true;
}

/**
 * Load a stage template module by stage number.
 * Uses StageRegistry for lookup with file-based fallback.
 * @param {number} stageNumber - Stage number (1-26)
 * @returns {Promise<Object>} Stage template with validate, computeDerived, analysisStep
 */
export async function loadStageTemplate(stageNumber) {
  await ensureRegistryInitialized();

  // Try registry first
  const template = stageRegistry.get(stageNumber);
  if (template) {
    return template;
  }

  // Direct file fallback (for stages not yet registered)
  const paddedNum = String(stageNumber).padStart(2, '0');
  const templatePath = join(STAGE_TEMPLATES_DIR, `stage-${paddedNum}.js`);

  try {
    const module = await import(`file://${templatePath.replace(/\\/g, '/')}`);
    const loaded = module.TEMPLATE || module.default;
    if (!loaded) {
      throw new Error(`Stage ${stageNumber} template has no TEMPLATE export`);
    }
    // Register for future lookups
    stageRegistry.register(stageNumber, loaded, { source: 'file' });
    return loaded;
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(`Stage ${stageNumber} template not found at ${templatePath}`);
    }
    throw err;
  }
}

/**
 * Per-stage entry in the upstream artifact map.
 * Contains merged data (for backward compatibility) plus lossless per-artifact-type access.
 * @typedef {Object} UpstreamStageEntry
 * @property {Object<string, *>} __byType - Lossless per-artifact-type data.
 *   Keys are artifact_type strings; values are the original artifact_data objects.
 *   Use this when you need collision-free access to a specific artifact type.
 */

/**
 * Map returned by fetchUpstreamArtifacts.
 * Keys are `stage${N}Data` strings (e.g., `stage5Data`).
 * Values are UpstreamStageEntry objects: merged data at the top level,
 * with `__byType` preserving each artifact type's original data losslessly.
 * @typedef {Object<string, UpstreamStageEntry>} UpstreamArtifactMap
 */

/**
 * Fetch upstream stage artifacts for a venture.
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {number[]} requiredStages - Stage numbers to fetch
 * @returns {Promise<UpstreamArtifactMap>} Map of `stage${N}Data` → merged data with `__byType` for lossless access
 */
export async function fetchUpstreamArtifacts(supabase, ventureId, requiredStages) {
  if (!requiredStages || requiredStages.length === 0) return {};

  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('lifecycle_stage, artifact_type, content, metadata, artifact_data, created_at')
    .eq('venture_id', ventureId)
    .eq('is_current', true)
    .in('lifecycle_stage', requiredStages)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to fetch upstream artifacts: ${error.message}`);

  const result = {};
  for (const artifact of data || []) {
    const key = `stage${artifact.lifecycle_stage}Data`;
    // artifact_data (JSONB) is primary; fall back to metadata or content
    let artifactData = artifact.artifact_data || artifact.metadata || artifact.content;
    if (typeof artifactData === 'string') {
      try { artifactData = JSON.parse(artifactData); } catch { /* keep as string */ }
    }
    // Skip null/empty artifact data to prevent shadowing
    if (!artifactData || (typeof artifactData === 'object' && Object.keys(artifactData).length === 0)) continue;

    if (!result[key]) {
      result[key] = typeof artifactData === 'object' ? { ...artifactData } : artifactData;
    } else if (typeof result[key] === 'object' && typeof artifactData === 'object') {
      // Merge multiple artifacts for same stage — newer artifacts override older on collision
      const collisions = Object.keys(artifactData).filter(k => k in result[key] && k !== '__byType' && result[key][k] !== artifactData[k]);
      if (collisions.length > 0) {
        console.warn(`[fetchUpstreamArtifacts] Stage ${artifact.lifecycle_stage}: field collision on [${collisions.join(', ')}] — newer artifact wins (use __byType.${artifact.artifact_type} for lossless access)`);
      }
      result[key] = { ...result[key], ...artifactData };
    }
    // Preserve per-artifact-type data for lossless access (avoids collision data loss)
    if (typeof result[key] === 'object' && artifact.artifact_type) {
      if (!result[key].__byType) result[key].__byType = {};
      result[key].__byType[artifact.artifact_type] = artifactData;
    }
  }
  return result;
}

/**
 * Validate stage output against template schema.
 * @param {Object} output - Stage analysis output
 * @param {Object} template - Stage template with validate()
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateOutput(output, template) {
  if (!template.validate) {
    return { valid: true, errors: [] };
  }

  try {
    const result = template.validate(output, { logger: { log: () => {}, warn: () => {}, error: () => {} } });
    return {
      valid: result.valid !== false,
      errors: result.errors || [],
    };
  } catch (err) {
    return { valid: false, errors: [`Validation threw: ${err.message}`] };
  }
}

/**
 * Persist stage artifact to venture_artifacts.
 * Marks previous versions as is_current=false.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {number} stageNumber - Lifecycle stage
 * @param {Object} artifactData - Stage output data
 * @param {Object} [evaKeys] - Optional EVA governance keys
 * @param {string|null} [evaKeys.visionKey] - Vision key for eager synthesis
 * @param {string|null} [evaKeys.planKey] - Architecture plan key for eager synthesis
 * @returns {Promise<string>} Inserted artifact ID
 */
export async function persistArtifact(supabase, ventureId, stageNumber, artifactData, evaKeys = {}) {
  // SD-EVA-FIX-STAGE-TEMPLATE-BYPASS-001: Migrated to unified persistence service
  // SD-LEO-INFRA-STREAM-VENTURE-EVA-002-C: Pass EVA keys for eager synthesis
  const artifactId = await writeArtifact(supabase, {
    ventureId,
    lifecycleStage: stageNumber,
    artifactType: `stage_${stageNumber}_analysis`,
    title: `Stage ${stageNumber} Analysis`,
    artifactData: typeof artifactData === 'object' ? artifactData : null,
    content: typeof artifactData === 'string' ? artifactData : null,
    source: 'stage-execution-engine',
    metadata: typeof artifactData === 'object' ? artifactData : null,
    visionKey: evaKeys.visionKey || null,
    planKey: evaKeys.planKey || null,
  });

  const data = { id: artifactId };

  // SD-MAN-INFRA-CORRECTIVE-ARCHITECTURE-GAP-003: Emit event after persistence
  try {
    await supabase.from('eva_orchestration_events').insert({
      event_type: 'stage_analysis_completed',
      event_source: 'stage_execution_engine',
      venture_id: ventureId,
      event_data: {
        stage_number: stageNumber,
        artifact_id: data.id,
        artifact_type: `stage_${stageNumber}_analysis`,
      },
      chairman_flagged: false,
    });
  } catch (_eventErr) {
    // Non-blocking: artifact already persisted
  }

  return data.id;
}

/**
 * Execute a stage's analysisStep for a venture.
 *
 * @param {Object} options
 * @param {number} options.stageNumber - Stage to execute (1-26)
 * @param {string} options.ventureId - Venture UUID
 * @param {boolean} [options.dryRun=false] - Skip persistence
 * @param {Object} [options.supabase] - Supabase client override
 * @param {Object} [options.logger] - Logger override
 * @returns {Promise<Object>} Execution result
 */
export async function executeStage(options = {}) {
  const {
    stageNumber,
    ventureId,
    dryRun = false,
    supabase: supabaseOverride,
    logger = console,
  } = options;

  const startTime = Date.now();

  const supabase = supabaseOverride || createSupabaseServiceClient();

  // 1. Load template
  const template = await loadStageTemplate(stageNumber);
  logger.log(`   Loaded stage ${stageNumber} template: ${template.title || template.id}`);

  // 2. Determine required upstream stages from centralized cross-stage dependency map
  let requiredStages = CROSS_STAGE_DEPS[stageNumber] || [];
  if (requiredStages.length === 0 && stageNumber > 1) {
    requiredStages = [stageNumber - 1]; // Default: previous stage
  }
  const upstreamData = await fetchUpstreamArtifacts(supabase, ventureId, requiredStages);

  // Alias stage0Data as 'synthesis' for Stage 1 hydration compatibility
  if (upstreamData.stage0Data && !upstreamData.synthesis) {
    upstreamData.synthesis = upstreamData.stage0Data;
  }

  // Fallback: load synthesis from venture metadata if no artifact exists
  if (stageNumber === 1 && !upstreamData.synthesis) {
    const { data: venture } = await supabase
      .from('ventures')
      .select('metadata')
      .eq('id', ventureId)
      .single();
    if (venture?.metadata?.stage_zero) {
      upstreamData.synthesis = venture.metadata.stage_zero;
    }
  }

  logger.log(`   Fetched ${Object.keys(upstreamData).length} upstream artifacts`);

  // 3. Pre-stage contract validation (FR-001: SD-MAN-INFRA-CORRECTIVE-V05-DATA-CONTRACTS-001)
  const enforcementMode = process.env.EVA_CONTRACT_ENFORCEMENT_MODE === 'advisory'
    ? CONTRACT_ENFORCEMENT.ADVISORY
    : CONTRACT_ENFORCEMENT.BLOCKING;

  // Build a Map<stageNumber, data> from the upstream data for contract validation
  const upstreamMap = new Map();
  for (const [key, value] of Object.entries(upstreamData)) {
    const match = key.match(/^stage(\d+)Data$/);
    if (match) upstreamMap.set(parseInt(match[1], 10), value);
  }

  const contractResult = validatePreStage(stageNumber, upstreamMap, { logger, enforcement: enforcementMode });
  logger.log(`   Contract validation: ${contractResult.valid ? 'PASS' : 'FAIL'} [${enforcementMode}] (${contractResult.errors.length} errors, ${contractResult.warnings.length} warnings)`);

  if (contractResult.blocked) {
    return {
      stageNumber,
      ventureId,
      template: 'pre-stage-blocked',
      hasAnalysisStep: false,
      output: null,
      validation: { valid: false, errors: contractResult.errors },
      artifactId: null,
      dryRun,
      latencyMs: Date.now() - startTime,
      persisted: false,
      contractViolation: true,
      contractErrors: contractResult.errors,
      enforcement: enforcementMode,
    };
  }

  // 3.5. Call onBeforeAnalysis hook if defined (chairman gates, etc.)
  let beforeAnalysisContext = {};
  if (typeof template.onBeforeAnalysis === 'function') {
    try {
      beforeAnalysisContext = await template.onBeforeAnalysis(supabase, ventureId) || {};
      logger.log(`   onBeforeAnalysis: ${JSON.stringify(beforeAnalysisContext).substring(0, 120)}`);
    } catch (err) {
      logger.warn(`   ⚠️ onBeforeAnalysis failed: ${err.message}`);
    }
  }

  // 4. Execute analysisStep
  let output;
  const hasAnalysisStep = typeof template.analysisStep === 'function';

  if (hasAnalysisStep) {
    try {
      output = await template.analysisStep({
        ...upstreamData,
        ...beforeAnalysisContext,
        logger,
        ventureName: ventureId,
        supabase,
        ventureId,
      });
    } catch (err) {
      throw err;
    }
  } else if (typeof template.computeDerived === 'function') {
    output = template.computeDerived(template.defaultData || {}, upstreamData, { logger });
  } else {
    output = template.defaultData || {};
  }

  // 4.5. Resolve chairman gate if onBeforeAnalysis created a pending decision
  if (beforeAnalysisContext.chairmanDecisionId && output) {
    // Check autonomy level — L2+ auto-approves chairman gates
    const autonomy = await checkAutonomy(ventureId, 'stage_gate', { supabase }).catch(() => ({ action: 'manual' }));
    if (autonomy.action === 'auto_approve') {
      // Auto-approve the pending decision in the database
      await supabase.from('chairman_decisions')
        .update({ status: 'approved', decision: 'proceed', rationale: `Auto-approved (${autonomy.level} autonomy)` })
        .eq('id', beforeAnalysisContext.chairmanDecisionId)
        .eq('status', 'pending');
      output.chairmanGate = {
        status: 'approved',
        rationale: `Auto-approved (${autonomy.level} autonomy)`,
        decision_id: beforeAnalysisContext.chairmanDecisionId,
      };
      logger.log(`   Chairman gate auto-approved (${autonomy.level})`);
    } else {
      try {
        const decisionResult = await waitForDecision({
          decisionId: beforeAnalysisContext.chairmanDecisionId,
          supabase,
          logger,
          timeoutMs: 5000, // Short timeout — decision should already exist
        });
        output.chairmanGate = {
          status: decisionResult.status,
          rationale: decisionResult.rationale,
          decision_id: beforeAnalysisContext.chairmanDecisionId,
        };
        logger.log(`   Chairman gate resolved: ${decisionResult.status}`);
      } catch (err) {
        logger.warn(`   ⚠️ Chairman gate resolution failed: ${err.message}`);
        output.chairmanGate = { status: 'pending', rationale: null, decision_id: beforeAnalysisContext.chairmanDecisionId };
      }
    }
  }

  // 4.6. Post-stage contract validation (SD-MAN-INFRA-STAGE-DATA-FLOW-001: FR-001)
  const postContractResult = validatePostStage(stageNumber, output, { logger, enforcement: enforcementMode });
  logger.log(`   Post-contract validation: ${postContractResult.valid ? 'PASS' : 'FAIL'} [${enforcementMode}] (${postContractResult.errors.length} errors)`);

  if (postContractResult.blocked) {
    return {
      stageNumber,
      ventureId,
      template: 'post-stage-blocked',
      hasAnalysisStep,
      output: null,
      validation: { valid: false, errors: postContractResult.errors },
      artifactId: null,
      dryRun,
      latencyMs: Date.now() - startTime,
      persisted: false,
      contractViolation: true,
      contractErrors: postContractResult.errors,
      enforcement: enforcementMode,
    };
  }

  // 5. Validate output
  const validation = validateOutput(output, template);
  logger.log(`   Validation: ${validation.valid ? 'PASS' : 'FAIL'} (${validation.errors.length} errors)`);

  // 6. Resolve EVA keys and persist (unless dry run)
  // SD-LEO-INFRA-STREAM-VENTURE-EVA-002-C: Pass vision/plan keys for eager synthesis
  let artifactId = null;
  let evaKeys = {};
  if (!dryRun && validation.valid) {
    if (stageNumber >= 1 && stageNumber <= 15) {
      try {
        evaKeys = await resolveEvaKeys(supabase, ventureId, stageNumber);
        if (evaKeys.visionKey || evaKeys.planKey) {
          logger.log(`   EVA keys: vision=${evaKeys.visionKey || 'none'}, plan=${evaKeys.planKey || 'none'}`);
        }
      } catch (evaErr) {
        logger.warn(`   ⚠️ EVA key resolution failed (non-blocking): ${evaErr.message}`);
      }
    }
    artifactId = await persistArtifact(supabase, ventureId, stageNumber, output, evaKeys);
    logger.log(`   Artifact persisted: ${artifactId}`);
  }

  // 6.5. Capability Contribution Score — non-blocking post-analysis hook
  // SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-E: Compute CCS after artifact persistence
  let capabilityScore = null;
  if (!dryRun && validation.valid && artifactId) {
    try {
      const { computeCapabilityScore } = await import('./capability-score/score-stage.js');
      capabilityScore = await computeCapabilityScore(stageNumber, output, {
        ventureId,
        artifactId,
        supabase,
        logger,
      });
    } catch (ccsErr) {
      // Non-blocking: artifact already persisted, CCS is additive
      logger.warn(`   CCS: Module unavailable or failed: ${ccsErr.message}`);
    }
  }

  // 6.7. Vision status transition after kill gates
  // SD-LEO-INFRA-STREAM-VENTURE-EVA-002-C: FR-4
  if (!dryRun && evaKeys.visionKey && (stageNumber === 3 || stageNumber === 5)) {
    try {
      const decision = output?.decision;
      if (decision === 'pass' && stageNumber === 5) {
        await supabase.from('eva_vision_documents')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('vision_key', evaKeys.visionKey);
        logger.log(`   EVA vision status → active (Stage 5 pass)`);
      } else if (decision === 'kill') {
        await supabase.from('eva_vision_documents')
          .update({ status: 'archived', updated_at: new Date().toISOString() })
          .eq('vision_key', evaKeys.visionKey);
        logger.log(`   EVA vision status → archived (Stage ${stageNumber} kill)`);
      }
    } catch (visionErr) {
      logger.warn(`   ⚠️ Vision status transition failed (non-blocking): ${visionErr.message}`);
    }
  }

  // 7. SD-MAN-GEN-CORRECTIVE-VISION-GAP-013 (A04): Require artifact output for non-dry-run
  if (!dryRun && !artifactId) {
    const reason = !validation.valid
      ? `Validation failed: ${validation.errors.join('; ')}`
      : 'Artifact persistence returned no ID';
    logger.warn(`   ⚠️ requireArtifact: Stage ${stageNumber} produced no artifact — ${reason}`);
  }

  const latencyMs = Date.now() - startTime;

  return {
    stageNumber,
    ventureId,
    template: template.id || `stage-${stageNumber}`,
    hasAnalysisStep,
    output,
    validation,
    artifactId,
    dryRun,
    latencyMs,
    persisted: !dryRun && validation.valid,
    artifactRequired: !dryRun,
    artifactMissing: !dryRun && !artifactId,
    capabilityScore,
  };
}
