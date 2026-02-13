/**
 * Stage 14 Template - Technical Architecture
 * Phase: THE BLUEPRINT (Stages 13-16)
 * Part of SD-LEO-FEAT-TMPL-BLUEPRINT-001
 *
 * Technical architecture definition with required stack layers
 * (frontend, backend, data, infra) and integration points.
 *
 * @module lib/eva/stage-templates/stage-14
 */

import { validateString, validateArray, collectErrors } from './validation.js';
import { analyzeStage14 } from './analysis-steps/stage-14-technical-architecture.js';

const REQUIRED_LAYERS = ['frontend', 'backend', 'data', 'infra'];
const MIN_INTEGRATION_POINTS = 1;

const TEMPLATE = {
  id: 'stage-14',
  slug: 'technical-architecture',
  title: 'Technical Architecture',
  version: '2.0.0',
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
      },
    },
    // Derived
    layer_count: { type: 'number', derived: true },
    total_components: { type: 'number', derived: true },
    all_layers_defined: { type: 'boolean', derived: true },
  },
  defaultData: {
    architecture_summary: null,
    layers: {},
    integration_points: [],
    constraints: [],
    layer_count: 0,
    total_components: 0,
    all_layers_defined: false,
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

    // Constraints (optional but if present, validate items)
    if (data?.constraints && Array.isArray(data.constraints)) {
      for (let i = 0; i < data.constraints.length; i++) {
        const c = data.constraints[i];
        const prefix = `constraints[${i}]`;
        const results = [
          validateString(c?.name, `${prefix}.name`, 1),
          validateString(c?.description, `${prefix}.description`, 1),
        ];
        errors.push(...collectErrors(results));
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

    return {
      ...data,
      layer_count,
      total_components,
      all_layers_defined,
    };
  },
};

TEMPLATE.analysisStep = analyzeStage14;

export { REQUIRED_LAYERS, MIN_INTEGRATION_POINTS };
export default TEMPLATE;
