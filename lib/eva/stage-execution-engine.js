/**
 * Stage Execution Engine
 * SD-MAN-FEAT-CORRECTIVE-VISION-GAP-001: FR-001
 *
 * Loads a stage template, invokes its analysisStep with upstream data,
 * validates output against schema, and persists the artifact.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const STAGE_TEMPLATES_DIR = join(__dirname, 'stage-templates');

/**
 * Load a stage template module by stage number.
 * @param {number} stageNumber - Stage number (1-25)
 * @returns {Promise<Object>} Stage template with validate, computeDerived, analysisStep
 */
export async function loadStageTemplate(stageNumber) {
  const paddedNum = String(stageNumber).padStart(2, '0');
  const templatePath = join(STAGE_TEMPLATES_DIR, `stage-${paddedNum}.js`);

  try {
    const module = await import(`file://${templatePath.replace(/\\/g, '/')}`);
    const template = module.TEMPLATE || module.default;
    if (!template) {
      throw new Error(`Stage ${stageNumber} template has no TEMPLATE export`);
    }
    return template;
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
    .select('lifecycle_stage, artifact_type, artifact_data, created_at')
    .eq('venture_id', ventureId)
    .eq('is_current', true)
    .in('lifecycle_stage', requiredStages)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch upstream artifacts: ${error.message}`);

  const result = {};
  for (const artifact of data || []) {
    const key = `stage${artifact.lifecycle_stage}Data`;
    if (!result[key]) {
      result[key] = artifact.artifact_data;
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
      artifact_data: artifactData,
      is_current: true,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Artifact persistence failed: ${error.message}`);
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

  const supabase = supabaseOverride || createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 1. Load template
  const template = await loadStageTemplate(stageNumber);
  logger.log(`   Loaded stage ${stageNumber} template: ${template.title || template.id}`);

  // 2. Determine required upstream stages
  const requiredStages = [];
  if (template.schema) {
    for (const [key] of Object.entries(template.schema)) {
      const match = key.match(/^stage(\d+)Data$/);
      if (match) requiredStages.push(parseInt(match[1]));
    }
  }

  // 3. Fetch upstream artifacts
  const upstreamData = await fetchUpstreamArtifacts(supabase, ventureId, requiredStages);
  logger.log(`   Fetched ${Object.keys(upstreamData).length} upstream artifacts`);

  // 4. Execute analysisStep (with timeout)
  let output;
  const hasAnalysisStep = typeof template.analysisStep === 'function';

  if (hasAnalysisStep) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      output = await template.analysisStep({
        ...upstreamData,
        logger,
        ventureName: ventureId,
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        logger.warn('   ⚠️ analysisStep timed out after 60s');
        output = template.defaultData || {};
        output._timeout = true;
      } else {
        throw err;
      }
    } finally {
      clearTimeout(timeout);
    }
  } else if (typeof template.computeDerived === 'function') {
    output = template.computeDerived(template.defaultData || {}, upstreamData, { logger });
  } else {
    output = template.defaultData || {};
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
  };
}
