/**
 * Validate Stage 14 LLM output against EHG_HOUSE_TECH_STACK.
 *
 * Belt-and-suspenders enforcement layer #2: catches deviation independent of
 * the prompt-text constraint. LLMs frequently ignore single-channel constraints,
 * so this post-parse check ensures a deviating output is rejected even if the
 * SYSTEM_PROMPT instruction was disregarded.
 *
 * SD-LEO-ENH-CONSTRAIN-STAGE-EHG-001
 *
 * @module lib/eva/utils/validate-house-stack-adherence
 */

import {
  EHG_HOUSE_TECH_STACK,
  EHG_HOUSE_AUTH_STRATEGY,
  HOUSE_STACK_LAYER_NAMES,
} from '../config/house-tech-stack.js';

/**
 * Compare parsed Stage 14 output against the EHG House Tech Stack.
 *
 * Layer-by-layer technology equality + auth strategy equality. When deviation
 * is found AND opts.allowOverride is false (no override_request set upstream),
 * returns valid=false with errors enumerating each deviation. When deviation
 * is found AND opts.allowOverride is true, returns valid=true with warnings —
 * caller is expected to verify parsed.override_reason is populated.
 *
 * @param {Object} parsed - Parsed Stage 14 LLM JSON (post-normalization)
 * @param {Object} [opts]
 * @param {boolean} [opts.allowOverride=false] - True when architecture_override_request was set
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateHouseStackAdherence(parsed, opts = {}) {
  const allowOverride = !!opts.allowOverride;
  const errors = [];
  const warnings = [];

  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, errors: ['Parsed input is null or not an object'], warnings: [] };
  }

  const layers = parsed.layers || {};
  for (const layerName of HOUSE_STACK_LAYER_NAMES) {
    const expected = EHG_HOUSE_TECH_STACK[layerName].technology;
    const actual = layers[layerName]?.technology;
    if (actual === undefined || actual === null) {
      errors.push(`layer ${layerName}: missing technology field (expected '${expected}')`);
      continue;
    }
    if (actual !== expected) {
      const msg = `layer ${layerName}: expected '${expected}', got '${actual}'`;
      if (allowOverride) {
        warnings.push(`${msg} (override permitted)`);
      } else {
        errors.push(`${msg}, no override_reason provided`);
      }
    }
  }

  // Security.authStrategy comparison (sixth free-choice scaffolding string)
  const expectedAuth = EHG_HOUSE_AUTH_STRATEGY.technology;
  const actualAuth = parsed.security?.authStrategy;
  if (actualAuth === undefined || actualAuth === null) {
    errors.push(`security.authStrategy: missing field (expected '${expectedAuth}')`);
  } else if (actualAuth !== expectedAuth) {
    const msg = `security.authStrategy: expected '${expectedAuth}', got '${actualAuth}'`;
    if (allowOverride) {
      warnings.push(`${msg} (override permitted)`);
    } else {
      errors.push(`${msg}, no override_reason provided`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Typed error thrown by analyzeStage14 when validation fails without an
 * authorized override. Distinguishes constraint-violation failures from
 * transient LLM errors so callers can route remediation appropriately.
 */
export class HouseStackDeviationError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'HouseStackDeviationError';
    this.code = 'HOUSE_STACK_DEVIATION';
    this.errors = errors;
  }
}
