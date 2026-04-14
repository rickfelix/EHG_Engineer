/**
 * Stage 11 Template - Naming & Visual Identity
 * Phase: THE IDENTITY (Stages 10-12)
 * Part of SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-A
 *
 * Evaluates naming candidates against Stage 10 customer personas.
 * Produces visual identity guidelines (colorPalette, typography, imageryGuidance).
 * Minimum 5 naming candidates with personaFit scores.
 * No chairman gate at Stage 11 (gate is at 12).
 *
 * @module lib/eva/stage-templates/stage-11
 */

import { validateString, validateNumber, validateArray, validateEnum, collectErrors } from './validation.js';
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage11 } from './analysis-steps/stage-11-visual-identity.js';

const MIN_CANDIDATES = 5;
const WEIGHT_SUM = 100;
const NAMING_STRATEGIES = ['descriptive', 'abstract', 'acronym', 'founder', 'metaphorical'];

const TEMPLATE = {
  id: 'stage-11',
  slug: 'naming-visual-identity',
  title: 'Naming & Visual Identity',
  version: '3.0.0',
  schema: {
    namingStrategy: {
      type: 'object',
      required: true,
      fields: {
        approach: { type: 'enum', values: NAMING_STRATEGIES },
        rationale: { type: 'string' },
      },
    },
    scoringCriteria: {
      type: 'array',
      minItems: 1,
      items: {
        name: { type: 'string', required: true },
        weight: { type: 'number', min: 0, max: 100, required: true },
      },
    },
    candidates: {
      type: 'array',
      minItems: MIN_CANDIDATES,
      items: {
        name: { type: 'string', required: true },
        rationale: { type: 'string', required: true },
        scores: { type: 'object', required: true },
        personaFit: { type: 'array', required: true },
      },
    },
    visualIdentity: {
      type: 'object',
      required: true,
      fields: {
        colorPalette: { type: 'array', minItems: 1 },
        typography: { type: 'object' },
        imageryGuidance: { type: 'string', required: true },
      },
    },
    brandExpression: {
      type: 'object',
      fields: {
        tagline: { type: 'string' },
        elevator_pitch: { type: 'string' },
        messaging_pillars: { type: 'array' },
      },
    },
    logoSpec: {
      type: 'object',
      fields: {
        textTreatment: { type: 'string' },
        primaryColor: { type: 'string' },
        accentColor: { type: 'string' },
        typography: { type: 'string' },
        iconConcept: { type: 'string' },
        svgPrompt: { type: 'string' },
      },
    },
    // Derived
    ranked_candidates: { type: 'array', derived: true },
    decision: { type: 'object', derived: true },
  },
  defaultData: {
    namingStrategy: { approach: null, rationale: null },
    scoringCriteria: [],
    candidates: [],
    visualIdentity: {
      colorPalette: [],
      typography: null,
      imageryGuidance: null,
    },
    brandExpression: { tagline: null, elevator_pitch: null, messaging_pillars: [] },
    logoSpec: null,
    ranked_candidates: [],
    decision: null,
  },

  validate(data, { logger = console } = {}) {
    const errors = [];

    // Naming strategy
    const ns = data?.namingStrategy;
    if (!ns || typeof ns !== 'object') {
      errors.push('namingStrategy is required and must be an object');
    } else {
      if (ns.approach !== null && ns.approach !== undefined) {
        const nsCheck = validateEnum(ns.approach, 'namingStrategy.approach', NAMING_STRATEGIES);
        if (!nsCheck.valid) errors.push(nsCheck.error);
      }
    }

    // Scoring criteria
    const criteriaCheck = validateArray(data?.scoringCriteria, 'scoringCriteria', 1);
    if (!criteriaCheck.valid) {
      errors.push(criteriaCheck.error);
    } else {
      let weightSum = 0;
      for (let i = 0; i < data.scoringCriteria.length; i++) {
        const c = data.scoringCriteria[i];
        const prefix = `scoringCriteria[${i}]`;
        const results = [
          validateString(c?.name, `${prefix}.name`, 1),
          validateNumber(c?.weight, `${prefix}.weight`, 0),
        ];
        errors.push(...collectErrors(results));
        if (typeof c?.weight === 'number') {
          if (c.weight > 100) errors.push(`${prefix}.weight must be <= 100 (got ${c.weight})`);
          weightSum += c.weight;
        }
      }
      if (Math.abs(weightSum - WEIGHT_SUM) > 0.001) {
        errors.push(`Scoring criteria weights must sum to ${WEIGHT_SUM} (got ${weightSum})`);
      }
    }

    // Candidates with personaFit
    const candidatesCheck = validateArray(data?.candidates, 'candidates', MIN_CANDIDATES);
    if (!candidatesCheck.valid) {
      errors.push(candidatesCheck.error);
    } else {
      for (let i = 0; i < data.candidates.length; i++) {
        const c = data.candidates[i];
        const prefix = `candidates[${i}]`;
        const results = [
          validateString(c?.name, `${prefix}.name`, 1),
          validateString(c?.rationale, `${prefix}.rationale`, 1),
        ];
        errors.push(...collectErrors(results));

        if (!c?.scores || typeof c.scores !== 'object') {
          errors.push(`${prefix}.scores is required and must be an object`);
        }
        // personaFit: array of persona-specific scores
        const pfCheck = validateArray(c?.personaFit, `${prefix}.personaFit`, 1);
        if (!pfCheck.valid) errors.push(pfCheck.error);
      }
    }

    // Visual identity
    const vi = data?.visualIdentity;
    if (!vi || typeof vi !== 'object') {
      errors.push('visualIdentity is required and must be an object');
    } else {
      const cpCheck = validateArray(vi.colorPalette, 'visualIdentity.colorPalette', 1);
      if (!cpCheck.valid) errors.push(cpCheck.error);

      const igCheck = validateString(vi.imageryGuidance, 'visualIdentity.imageryGuidance', 1);
      if (!igCheck.valid) errors.push(igCheck.error);

      if (!vi.typography || typeof vi.typography !== 'object') {
        errors.push('visualIdentity.typography is required and must be an object');
      }
    }

    // Logo spec (optional — validates structure when present)
    const logo = data?.logoSpec;
    if (logo != null) {
      if (typeof logo !== 'object') {
        errors.push('logoSpec must be an object when provided');
      } else {
        for (const field of ['textTreatment', 'primaryColor', 'accentColor', 'typography', 'iconConcept', 'svgPrompt']) {
          if (logo[field] != null) {
            const check = validateString(logo[field], `logoSpec.${field}`, 1);
            if (!check.valid) errors.push(check.error);
          }
        }
        if (logo.primaryColor && !/^#[0-9a-fA-F]{6}$/.test(logo.primaryColor)) {
          errors.push(`logoSpec.primaryColor must be a valid hex color (got '${logo.primaryColor}')`);
        }
        if (logo.accentColor && !/^#[0-9a-fA-F]{6}$/.test(logo.accentColor)) {
          errors.push(`logoSpec.accentColor must be a valid hex color (got '${logo.accentColor}')`);
        }
      }
    }

    if (errors.length > 0) { logger.warn('[Stage11] Validation failed', { errorCount: errors.length, errors }); }
    return { valid: errors.length === 0, errors };
  },

  computeDerived(data, { logger: _logger = console } = {}) {
    return { ...data };
  },
};

TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);
TEMPLATE.analysisStep = analyzeStage11;
ensureOutputSchema(TEMPLATE);

export { MIN_CANDIDATES, WEIGHT_SUM, NAMING_STRATEGIES };
export default TEMPLATE;
