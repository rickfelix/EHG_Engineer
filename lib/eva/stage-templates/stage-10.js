/**
 * Stage 10 Template - Customer & Brand Foundation
 * Phase: THE IDENTITY (Stages 10-12)
 * Part of SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-A
 *
 * Customer personas FIRST, then brand genome grounded in persona insights.
 * Minimum 3 personas required. Brand genome includes customerAlignment.
 * Chairman governance gate preserved as blocking gate.
 *
 * @module lib/eva/stage-templates/stage-10
 */

import { validateString, validateNumber, validateArray, validateEnum, collectErrors } from './validation.js';
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage10 } from './analysis-steps/stage-10-customer-brand.js';
import { createOrReusePendingDecision } from '../chairman-decision-watcher.js';

const MIN_PERSONAS = 3;
const MIN_CANDIDATES = 5;
const WEIGHT_SUM = 100;
const BRAND_GENOME_KEYS = ['archetype', 'values', 'tone', 'audience', 'differentiators'];
const NAMING_STRATEGIES = ['descriptive', 'abstract', 'acronym', 'founder', 'metaphorical'];
const ARCHETYPES = ['Hero', 'Explorer', 'Creator', 'Sage', 'Innocent', 'Outlaw', 'Magician', 'Ruler', 'Caregiver', 'Everyman', 'Jester', 'Lover'];

const TEMPLATE = {
  id: 'stage-10',
  slug: 'customer-brand-foundation',
  title: 'Customer & Brand Foundation',
  version: '3.0.0',
  schema: {
    customerPersonas: {
      type: 'array',
      minItems: MIN_PERSONAS,
      items: {
        name: { type: 'string', required: true },
        demographics: { type: 'object', required: true },
        goals: { type: 'array', minItems: 1 },
        painPoints: { type: 'array', minItems: 1 },
        behaviors: { type: 'array' },
        motivations: { type: 'array' },
      },
    },
    brandGenome: {
      type: 'object',
      required: true,
      fields: {
        archetype: { type: 'string', required: true },
        values: { type: 'array', minItems: 1 },
        tone: { type: 'string', required: true },
        audience: { type: 'string', required: true },
        differentiators: { type: 'array', minItems: 1 },
        customerAlignment: { type: 'array', minItems: 1 },
      },
    },
    brandPersonality: {
      type: 'object',
      fields: {
        vision: { type: 'string' },
        mission: { type: 'string' },
        brandVoice: { type: 'string' },
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
      },
    },
    namingStrategy: { type: 'enum', values: NAMING_STRATEGIES },
    chairmanGate: {
      type: 'object',
      fields: {
        status: { type: 'string' },
        rationale: { type: 'string' },
        decision_id: { type: 'string' },
      },
    },
    // Derived
    personaCoverageScore: { type: 'number', derived: true },
    ranked_candidates: { type: 'array', derived: true },
    decision: { type: 'object', derived: true },
    sourceProvenance: { type: 'object', derived: true },
  },
  defaultData: {
    customerPersonas: [],
    brandGenome: {
      archetype: null,
      values: [],
      tone: null,
      audience: null,
      differentiators: [],
      customerAlignment: [],
    },
    brandPersonality: { vision: null, mission: null, brandVoice: null },
    scoringCriteria: [],
    candidates: [],
    namingStrategy: null,
    ranked_candidates: [],
    decision: null,
    chairmanGate: { status: 'pending', rationale: null, decision_id: null },
    personaCoverageScore: null,
    sourceProvenance: null,
  },

  validate(data, { logger = console } = {}) {
    const errors = [];

    // Customer personas (min 3)
    const personasCheck = validateArray(data?.customerPersonas, 'customerPersonas', MIN_PERSONAS);
    if (!personasCheck.valid) {
      errors.push(personasCheck.error);
    } else {
      for (let i = 0; i < data.customerPersonas.length; i++) {
        const p = data.customerPersonas[i];
        const prefix = `customerPersonas[${i}]`;
        const results = [
          validateString(p?.name, `${prefix}.name`, 1),
        ];
        errors.push(...collectErrors(results));

        if (!p?.demographics || typeof p.demographics !== 'object') {
          errors.push(`${prefix}.demographics is required and must be an object`);
        }
        const goalsCheck = validateArray(p?.goals, `${prefix}.goals`, 1);
        if (!goalsCheck.valid) errors.push(goalsCheck.error);
        const painCheck = validateArray(p?.painPoints, `${prefix}.painPoints`, 1);
        if (!painCheck.valid) errors.push(painCheck.error);
      }
    }

    // Brand genome
    const bg = data?.brandGenome;
    if (!bg || typeof bg !== 'object') {
      errors.push('brandGenome is required and must be an object');
    } else {
      for (const key of BRAND_GENOME_KEYS) {
        if (Array.isArray(bg[key])) {
          const arrCheck = validateArray(bg[key], `brandGenome.${key}`, 1);
          if (!arrCheck.valid) errors.push(arrCheck.error);
        } else {
          const strCheck = validateString(bg[key], `brandGenome.${key}`, 1);
          if (!strCheck.valid) errors.push(strCheck.error);
        }
      }
      // customerAlignment: each trait must link to persona insight
      const caCheck = validateArray(bg.customerAlignment, 'brandGenome.customerAlignment', 1);
      if (!caCheck.valid) {
        errors.push(caCheck.error);
      } else {
        for (let i = 0; i < bg.customerAlignment.length; i++) {
          const ca = bg.customerAlignment[i];
          const prefix = `brandGenome.customerAlignment[${i}]`;
          if (!ca?.trait) errors.push(`${prefix}.trait is required`);
          if (!ca?.personaInsight) errors.push(`${prefix}.personaInsight is required`);
          if (!ca?.personaName) errors.push(`${prefix}.personaName is required`);
        }
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

    // Candidates
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
      }
    }

    // Brand personality (optional fields)
    const bp = data?.brandPersonality;
    if (bp && typeof bp === 'object') {
      for (const field of ['vision', 'mission', 'brandVoice']) {
        if (bp[field] !== null && bp[field] !== undefined) {
          const bpCheck = validateString(bp[field], `brandPersonality.${field}`, 1);
          if (!bpCheck.valid) errors.push(bpCheck.error);
        }
      }
    }

    // Naming strategy enum
    if (data?.namingStrategy !== null && data?.namingStrategy !== undefined) {
      const nsCheck = validateEnum(data.namingStrategy, 'namingStrategy', NAMING_STRATEGIES);
      if (!nsCheck.valid) errors.push(nsCheck.error);
    }

    // Chairman governance gate check
    const gateStatus = data?.chairmanGate?.status;
    if (gateStatus === 'rejected') {
      errors.push(`Chairman gate rejected: ${data.chairmanGate.rationale || 'No rationale provided'}`);
    } else if (gateStatus !== 'approved') {
      errors.push('Chairman brand approval gate is pending — awaiting chairman decision');
    }

    if (errors.length > 0) { logger.warn('[Stage10] Validation failed', { errorCount: errors.length, errors }); }
    return { valid: errors.length === 0, errors };
  },

  computeDerived(data, { logger: _logger = console } = {}) {
    // Compute persona coverage score
    if (Array.isArray(data?.customerPersonas) && data.customerPersonas.length > 0) {
      const fieldsPerPersona = ['name', 'demographics', 'goals', 'painPoints'];
      let totalFields = 0;
      let populatedFields = 0;
      for (const p of data.customerPersonas) {
        for (const f of fieldsPerPersona) {
          totalFields++;
          if (p[f] && (typeof p[f] !== 'object' || (Array.isArray(p[f]) ? p[f].length > 0 : Object.keys(p[f]).length > 0))) {
            populatedFields++;
          }
        }
      }
      data.personaCoverageScore = totalFields > 0 ? Math.round((populatedFields / totalFields) * 100) : 0;
    }
    return { ...data };
  },
};

/**
 * Pre-analysis hook: create or reuse a PENDING chairman decision.
 * Blocks venture progression until chairman approves brand direction.
 */
TEMPLATE.onBeforeAnalysis = async function onBeforeAnalysis(supabase, ventureId) {
  const { id, isNew } = await createOrReusePendingDecision({
    ventureId,
    stageNumber: 10,
    summary: 'Chairman brand approval required for Stage 10 (Customer & Brand Foundation)',
    supabase,
  });
  return { chairmanDecisionId: id, isNew };
};

TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);
TEMPLATE.analysisStep = analyzeStage10;
ensureOutputSchema(TEMPLATE);

export { MIN_PERSONAS, MIN_CANDIDATES, WEIGHT_SUM, BRAND_GENOME_KEYS, NAMING_STRATEGIES, ARCHETYPES };
export default TEMPLATE;
