/**
 * Inline Analysis Adapter
 * SD-MAN-FEAT-CORRECTIVE-VISION-GAP-002: FR-001
 *
 * Enables stage analysisSteps to run via Claude Code inline evaluation,
 * eliminating external LLM API key dependency. Follows the vision-heal.js
 * inline scoring pattern: output context → Claude processes → persist result.
 *
 * Usage:
 *   // Inline mode: output context for Claude Code
 *   node scripts/eva/run-stage.js --venture-id <UUID> --stage <N> --inline
 *
 *   // Persist mode: write Claude Code's analysis result
 *   node scripts/eva/run-stage.js --venture-id <UUID> --stage <N> --persist '<JSON>'
 */

import { createClient } from '@supabase/supabase-js';
import { loadStageTemplate, fetchUpstreamArtifacts, validateOutput, persistArtifact } from './stage-execution-engine.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Output analysis context for Claude Code inline processing.
 *
 * @param {Object} options
 * @param {number} options.stageNumber - Stage to analyze (1-25)
 * @param {string} options.ventureId - Venture UUID
 * @param {Object} [options.supabase] - Supabase client override
 * @returns {Promise<Object>} Context object for Claude Code
 */
export async function outputInlineContext(options = {}) {
  const { stageNumber, ventureId, supabase: supabaseOverride } = options;

  const supabase = supabaseOverride || createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Load template
  const template = await loadStageTemplate(stageNumber);

  // Determine upstream dependencies
  const requiredStages = [];
  if (template.schema) {
    for (const key of Object.keys(template.schema)) {
      const match = key.match(/^stage(\d+)Data$/);
      if (match) requiredStages.push(parseInt(match[1]));
    }
  }

  // Fetch upstream artifacts
  const upstreamData = await fetchUpstreamArtifacts(supabase, ventureId, requiredStages);

  // Build schema description
  const schemaFields = template.schema
    ? Object.entries(template.schema).map(([key, def]) => ({
        field: key,
        type: typeof def === 'object' ? (def.type || 'any') : typeof def,
        derived: typeof def === 'object' ? !!def.derived : false,
        required: typeof def === 'object' ? def.required !== false : true,
      }))
    : [];

  const context = {
    mode: 'INLINE_STAGE_ANALYSIS',
    instruction: [
      `Claude Code: Analyze this venture for Stage ${stageNumber} (${template.title || template.id}).`,
      'Review the upstream data and produce a structured analysis matching the output schema.',
      `After analysis, run: node scripts/eva/run-stage.js --venture-id ${ventureId} --stage ${stageNumber} --persist '<YOUR_JSON>'`,
    ].join('\n'),
    stage: {
      number: stageNumber,
      id: template.id,
      title: template.title || `Stage ${stageNumber}`,
      slug: template.slug || '',
    },
    ventureId,
    upstreamData,
    upstreamStages: requiredStages,
    outputSchema: schemaFields.filter(f => !f.derived && !f.field.match(/^stage\d+Data$/)),
    derivedFields: schemaFields.filter(f => f.derived).map(f => f.field),
    defaultData: template.defaultData || {},
  };

  console.log('===INLINE_STAGE_ANALYSIS_CONTEXT===');
  console.log(JSON.stringify(context, null, 2));
  console.log('===END_CONTEXT===');
  console.log('');
  console.log(`Claude Code: analyze the venture for Stage ${stageNumber}, then run:`);
  console.log(`  node scripts/eva/run-stage.js --venture-id ${ventureId} --stage ${stageNumber} --persist '<JSON>'`);

  return context;
}

/**
 * Persist Claude Code's inline analysis result as a venture artifact.
 *
 * @param {Object} options
 * @param {number} options.stageNumber - Stage number
 * @param {string} options.ventureId - Venture UUID
 * @param {string} options.resultJson - JSON string of analysis result
 * @param {Object} [options.supabase] - Supabase client override
 * @returns {Promise<Object>} Persistence result
 */
export async function persistInlineResult(options = {}) {
  const { stageNumber, ventureId, resultJson, supabase: supabaseOverride } = options;

  const supabase = supabaseOverride || createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const parsed = JSON.parse(resultJson);

  // Load template for validation
  const template = await loadStageTemplate(stageNumber);

  // Validate output
  const validation = validateOutput(parsed, template);
  console.log(`   Validation: ${validation.valid ? 'PASS' : 'FAIL'} (${validation.errors.length} errors)`);

  if (validation.errors.length > 0) {
    for (const err of validation.errors) {
      console.log(`     - ${err}`);
    }
  }

  // Persist artifact
  if (validation.valid) {
    const artifactId = await persistArtifact(supabase, ventureId, stageNumber, parsed);
    console.log(`   ✅ Artifact persisted: ${artifactId}`);
    console.log('   Scored by: claude-code-inline');
    return { persisted: true, artifactId, validation };
  }

  console.log('   ⚠️ Not persisted (validation failed)');
  return { persisted: false, artifactId: null, validation };
}
