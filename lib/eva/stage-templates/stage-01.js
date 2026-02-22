/**
 * Stage 01 Template - Draft Idea
 * Phase: THE TRUTH (Stages 1-5)
 * Part of SD-EVA-FEAT-TEMPLATES-TRUTH-001
 *
 * Captures a minimally viable venture idea with required fields
 * and enforces input constraints for consistent downstream scoring.
 * Hydrates from Stage 0 synthesis output.
 *
 * Cross-stage contracts:
 *   → Stage 2: context/description for MoA analysis
 *   → Stage 3: problemStatement (customerNeed), archetype (scoring weights), keyAssumptions
 *   → Stage 23: successCriteria
 *
 * @module lib/eva/stage-templates/stage-01
 */

import { validateString, validateArray, validateEnum, collectErrors } from './validation.js';
import { analyzeStage01 } from './analysis-steps/stage-01-hydration.js';
import { recommendTemplates, applyTemplate } from '../template-applier.js';
import { ensureOutputSchema } from './output-schema-extractor.js';

const ARCHETYPES = [
  'saas', 'marketplace', 'deeptech', 'hardware', 'services', 'media', 'fintech',
];

const TEMPLATE = {
  id: 'stage-01',
  slug: 'draft-idea',
  title: 'Idea Capture',
  version: '2.0.0',
  schema: {
    description: { type: 'string', minLength: 50, required: true },
    problemStatement: { type: 'string', minLength: 20, required: true },
    valueProp: { type: 'string', minLength: 20, required: true },
    targetMarket: { type: 'string', minLength: 10, required: true },
    archetype: { type: 'enum', values: ARCHETYPES, required: true },
    keyAssumptions: { type: 'array', items: { type: 'string' }, required: false },
    moatStrategy: { type: 'string', required: false },
    successCriteria: { type: 'array', items: { type: 'string' }, required: false },
    sourceProvenance: { type: 'object', derived: true },
  },
  defaultData: {
    description: '',
    problemStatement: '',
    valueProp: '',
    targetMarket: '',
    archetype: null,
    keyAssumptions: [],
    moatStrategy: '',
    successCriteria: [],
    sourceProvenance: {},
  },

  /**
   * Validate stage input data.
   * @param {Object} data
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data, { logger = console } = {}) {
    const results = [
      validateString(data?.description, 'description', 50),
      validateString(data?.problemStatement, 'problemStatement', 20),
      validateString(data?.valueProp, 'valueProp', 20),
      validateString(data?.targetMarket, 'targetMarket', 10),
      validateEnum(data?.archetype, 'archetype', ARCHETYPES),
    ];

    // Optional arrays: validate only if provided
    if (data?.keyAssumptions !== undefined && data.keyAssumptions !== null) {
      if (!Array.isArray(data.keyAssumptions)) {
        results.push({ valid: false, error: 'keyAssumptions must be an array' });
      }
    }
    if (data?.successCriteria !== undefined && data.successCriteria !== null) {
      if (!Array.isArray(data.successCriteria)) {
        results.push({ valid: false, error: 'successCriteria must be an array' });
      }
    }

    const errors = collectErrors(results);
    if (errors.length > 0) { logger.warn('[Stage01] Validation failed', { errorCount: errors.length, errors }); }
    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields: sourceProvenance tracks field origins.
   * @param {Object} data - Validated input data
   * @param {Object} [stage0Output] - Optional Stage 0 synthesis output for provenance tracking
   * @returns {Object} Data with sourceProvenance
   */
  computeDerived(data, stage0Output, { logger = console } = {}) {
    const provenance = {};
    const stage0Fields = stage0Output ? Object.keys(stage0Output) : [];

    for (const field of ['description', 'problemStatement', 'valueProp', 'targetMarket', 'archetype', 'moatStrategy']) {
      if (stage0Fields.includes(field) && data[field]) {
        provenance[field] = 'stage0';
      } else if (data[field]) {
        provenance[field] = 'user';
      }
    }

    return { ...data, sourceProvenance: provenance };
  },
};

TEMPLATE.analysisStep = analyzeStage01;
ensureOutputSchema(TEMPLATE);

/**
 * Pre-analysis hook: Recommend and apply templates before Stage 1 hydration.
 * SD-EVA-FEAT-VENTURE-TEMPLATES-001 (FR-6, FR-9)
 *
 * Called before the analysisStep to inject template context from similar
 * successful ventures into the Stage 1 analysis.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId
 * @returns {Promise<{templateContext: object|null, recommendations: Array}>}
 */
TEMPLATE.onBeforeAnalysis = async function onBeforeAnalysis(supabase, ventureId) {
  try {
    const result = await recommendTemplates(supabase, ventureId);
    if (result.status !== 'complete' || result.recommendations.length === 0) {
      return { templateContext: null, recommendations: [] };
    }

    // Apply top-ranked template
    const top = result.recommendations[0];
    const { templateContext } = await applyTemplate(supabase, ventureId, top.templateId);

    return { templateContext, recommendations: result.recommendations };
  } catch (err) {
    console.warn(`Template recommendation failed for venture ${ventureId}: ${err.message}`);
    return { templateContext: null, recommendations: [] };
  }
};

export { ARCHETYPES };
export default TEMPLATE;
