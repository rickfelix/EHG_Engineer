/**
 * Stage 14 Template - Technical Architecture
 * Phase: THE BLUEPRINT (Stages 13-16)
 * Part of SD-LEO-FEAT-TMPL-BLUEPRINT-001
 *
 * Technical architecture definition with required stack layers
 * (presentation, api, business_logic, data, infrastructure),
 * security object, data entities, and integration points.
 *
 * @module lib/eva/stage-templates/stage-14
 */

import { validateString, validateArray, validateEnum, collectErrors } from './validation.js';
import { analyzeStage14 } from './analysis-steps/stage-14-technical-architecture.js';

const REQUIRED_LAYERS = ['presentation', 'api', 'business_logic', 'data', 'infrastructure'];
const MIN_INTEGRATION_POINTS = 1;
const MIN_DATA_ENTITIES = 1;
const CONSTRAINT_CATEGORIES = ['performance', 'security', 'compliance', 'operational'];

const TEMPLATE = {
  id: 'stage-14',
  slug: 'technical-architecture',
  title: 'Technical Architecture',
  version: '3.0.0',
  schema: {
    architecture_summary: { type: 'string', minLength: 20, required: true },
    layers: {
      type: 'object',
      required: true,
      properties: Object.fromEntries(REQUIRED_LAYERS.map(l => [l, {
        technology: { type: 'string', required: true },
        components: { type: 'array', minItems: 1 },
        rationale: { type: 'string', required: true },
      }])),
    },
    security: {
      type: 'object',
      required: true,
      properties: {
        authStrategy: { type: 'string', required: true },
        dataClassification: { type: 'string', required: true },
        complianceRequirements: { type: 'array', items: { type: 'string' } },
      },
    },
    dataEntities: {
      type: 'array',
      minItems: MIN_DATA_ENTITIES,
      items: {
        name: { type: 'string', required: true },
        description: { type: 'string', required: true },
        relationships: { type: 'array', items: { type: 'string' } },
        estimatedVolume: { type: 'string' },
      },
    },
    integration_points: {
      type: 'array',
      minItems: MIN_INTEGRATION_POINTS,
      items: {
        name: { type: 'string', required: true },
        source_layer: { type: 'string', required: true },
        target_layer: { type: 'string', required: true },
        protocol: { type: 'string', required: true },
      },
    },
    constraints: {
      type: 'array',
      items: {
        name: { type: 'string', required: true },
        description: { type: 'string', required: true },
        category: { type: 'enum', values: CONSTRAINT_CATEGORIES },
      },
    },
    // Derived
    layer_count: { type: 'number', derived: true },
    total_components: { type: 'number', derived: true },
    all_layers_defined: { type: 'boolean', derived: true },
    entity_count: { type: 'number', derived: true },
  },
  defaultData: {
    architecture_summary: null,
    layers: {},
    security: { authStrategy: null, dataClassification: null, complianceRequirements: [] },
    dataEntities: [],
    integration_points: [],
    constraints: [],
    layer_count: 0,
    total_components: 0,
    all_layers_defined: false,
    entity_count: 0,
  },

  /**
   * Validate stage input data.
   * @param {Object} data
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data) {
    const errors = [];

    const summaryCheck = validateString(data?.architecture_summary, 'architecture_summary', 20);
    if (!summaryCheck.valid) errors.push(summaryCheck.error);

    // Validate each required layer
    if (!data?.layers || typeof data.layers !== 'object') {
      errors.push('layers is required and must be an object');
    } else {
      for (const layer of REQUIRED_LAYERS) {
        const l = data.layers[layer];
        if (!l || typeof l !== 'object') {
          errors.push(`layers.${layer} is required`);
          continue;
        }
        const prefix = `layers.${layer}`;
        const results = [
          validateString(l?.technology, `${prefix}.technology`, 1),
          validateString(l?.rationale, `${prefix}.rationale`, 1),
        ];
        errors.push(...collectErrors(results));

        const compCheck = validateArray(l?.components, `${prefix}.components`, 1);
        if (!compCheck.valid) errors.push(compCheck.error);
      }
    }

    // Security object
    if (!data?.security || typeof data.security !== 'object') {
      errors.push('security is required and must be an object');
    } else {
      const secResults = [
        validateString(data.security.authStrategy, 'security.authStrategy', 1),
        validateString(data.security.dataClassification, 'security.dataClassification', 1),
      ];
      errors.push(...collectErrors(secResults));

      if (data.security.complianceRequirements !== undefined) {
        if (!Array.isArray(data.security.complianceRequirements)) {
          errors.push('security.complianceRequirements must be an array');
        }
      }
    }

    // Data entities
    const entCheck = validateArray(data?.dataEntities, 'dataEntities', MIN_DATA_ENTITIES);
    if (!entCheck.valid) {
      errors.push(entCheck.error);
    } else {
      for (let i = 0; i < data.dataEntities.length; i++) {
        const de = data.dataEntities[i];
        const prefix = `dataEntities[${i}]`;
        const results = [
          validateString(de?.name, `${prefix}.name`, 1),
          validateString(de?.description, `${prefix}.description`, 1),
        ];
        errors.push(...collectErrors(results));

        if (de?.relationships !== undefined && !Array.isArray(de.relationships)) {
          errors.push(`${prefix}.relationships must be an array`);
        }
      }
    }

    // Integration points
    const intCheck = validateArray(data?.integration_points, 'integration_points', MIN_INTEGRATION_POINTS);
    if (!intCheck.valid) {
      errors.push(intCheck.error);
    } else {
      for (let i = 0; i < data.integration_points.length; i++) {
        const ip = data.integration_points[i];
        const prefix = `integration_points[${i}]`;
        const results = [
          validateString(ip?.name, `${prefix}.name`, 1),
          validateString(ip?.source_layer, `${prefix}.source_layer`, 1),
          validateString(ip?.target_layer, `${prefix}.target_layer`, 1),
          validateString(ip?.protocol, `${prefix}.protocol`, 1),
        ];
        errors.push(...collectErrors(results));
      }
    }

    // Constraints (optional but validate items if present)
    if (data?.constraints && Array.isArray(data.constraints)) {
      for (let i = 0; i < data.constraints.length; i++) {
        const c = data.constraints[i];
        const prefix = `constraints[${i}]`;
        const results = [
          validateString(c?.name, `${prefix}.name`, 1),
          validateString(c?.description, `${prefix}.description`, 1),
        ];
        errors.push(...collectErrors(results));

        if (c?.category !== undefined) {
          const catCheck = validateEnum(c.category, `${prefix}.category`, CONSTRAINT_CATEGORIES);
          if (!catCheck.valid) errors.push(catCheck.error);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields.
   * @param {Object} data - Validated input data
   * @returns {Object} Data with derived fields
   */
  computeDerived(data) {
    const definedLayers = REQUIRED_LAYERS.filter(l => data.layers[l]);
    const layer_count = definedLayers.length;
    const total_components = definedLayers.reduce(
      (sum, l) => sum + (data.layers[l]?.components?.length || 0),
      0,
    );
    const all_layers_defined = layer_count === REQUIRED_LAYERS.length;
    const entity_count = data.dataEntities?.length || 0;

    return {
      ...data,
      layer_count,
      total_components,
      all_layers_defined,
      entity_count,
    };
  },
};

TEMPLATE.analysisStep = analyzeStage14;

export { REQUIRED_LAYERS, MIN_INTEGRATION_POINTS, MIN_DATA_ENTITIES, CONSTRAINT_CATEGORIES };
export default TEMPLATE;
