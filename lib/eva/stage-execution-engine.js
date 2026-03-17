/**
 * Stage Execution Engine
 * SD-MAN-FEAT-CORRECTIVE-VISION-GAP-001: FR-001
 *
 * Loads a stage template, invokes its analysisStep with upstream data,
 * validates output against schema, and persists the artifact.
 */

import { createSupabaseServiceClient } from '../supabase-client.js';
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
 * @param {number} stageNumber - Stage number (1-25)
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
 * Fetch upstream stage artifacts for a venture.
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {number[]} requiredStages - Stage numbers to fetch
 * @returns {Promise<Object>} Map of stageNumber → artifact data
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
      const collisions = Object.keys(artifactData).filter(k => k in result[key] && result[key][k] !== artifactData[k]);
      if (collisions.length > 0) {
        console.warn(`[fetchUpstreamArtifacts] Stage ${artifact.lifecycle_stage}: field collision on [${collisions.join(', ')}] — newer artifact wins`);
      }
      result[key] = { ...result[key], ...artifactData };
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
 * @returns {Promise<string>} Inserted artifact ID
 */
export async function persistArtifact(supabase, ventureId, stageNumber, artifactData) {
  // Mark previous versions as not current
  await supabase
    .from('venture_artifacts')
    .update({ is_current: false })
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', stageNumber)
    .eq('is_current', true);

  // Insert new artifact
  const { data, error } = await supabase
    .from('venture_artifacts')
    .insert({
      venture_id: ventureId,
      lifecycle_stage: stageNumber,
      artifact_type: `stage_${stageNumber}_analysis`,
      title: `Stage ${stageNumber} Analysis`,
      content: typeof artifactData === 'string' ? artifactData : JSON.stringify(artifactData),
      metadata: typeof artifactData === 'object' ? artifactData : null,
      is_current: true,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Artifact persistence failed: ${error.message}`);

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
 * @param {number} options.stageNumber - Stage to execute (1-25)
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

  // 6. Persist (unless dry run)
  let artifactId = null;
  if (!dryRun && validation.valid) {
    artifactId = await persistArtifact(supabase, ventureId, stageNumber, output);
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
