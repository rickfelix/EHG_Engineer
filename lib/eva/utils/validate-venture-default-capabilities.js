/**
 * Validate Stage 19 LLM output against EHG_VENTURE_DEFAULT_CAPABILITIES.
 *
 * Belt-and-suspenders enforcement layer #2: catches deviation independent of
 * the prompt-text constraint. LLMs frequently ignore single-channel constraints,
 * so this post-parse check ensures a sprint plan missing a mandatory capability
 * is rejected even if the SYSTEM_PROMPT instruction was disregarded.
 *
 * Override hatch: `defaultCapabilitiesOverride[<capability_id>].override_reason`
 * (non-empty trimmed string) permits intentional omission for legitimate cases
 * (B2B-only ventures, sub-15-pt sprints). Empty / null / whitespace-only
 * `override_reason` is FAIL-CLOSED — accidental or buggy overrides do NOT
 * bypass the gate.
 *
 * SD-LEO-ENH-CONSTRAIN-STAGE-EMIT-001
 * Sibling pattern: lib/eva/utils/validate-house-stack-adherence.js
 *
 * @module lib/eva/utils/validate-venture-default-capabilities
 */

import { EHG_VENTURE_DEFAULT_CAPABILITIES } from '../config/venture-default-capabilities.js';

/**
 * Match a capability against any sprint item by title-prefix or capability_id substring,
 * case-insensitive. Permissive matching tolerates LLM rephrasings of the canonical name.
 *
 * @param {Object} capability - One EHG_VENTURE_DEFAULT_CAPABILITIES entry
 * @param {Array} sprintItems - parsedSprintPlan.sprintItems (post-normalization)
 * @returns {boolean} true if any sprint item resembles this capability
 */
function isCapabilityPresent(capability, sprintItems) {
  if (!Array.isArray(sprintItems)) return false;
  const nameLower = String(capability.name || '').toLowerCase();
  const idLower = String(capability.capability_id || '').toLowerCase();
  for (const item of sprintItems) {
    const title = String(item?.title || '').toLowerCase();
    if (title && (title.startsWith(nameLower) || title.includes(idLower) || nameLower.split(' ').slice(-2).every(w => title.includes(w)))) {
      return true;
    }
  }
  return false;
}

/**
 * Validate the parsed Stage 19 sprint plan against EHG_VENTURE_DEFAULT_CAPABILITIES.
 *
 * @param {Object} parsedSprintPlan - Parsed Stage 19 LLM output (post-normalization)
 * @param {Object} [opts]
 * @param {Object} [opts.defaultCapabilitiesOverride={}] - { [capability_id]: { override_reason: string } }
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateVentureDefaultCapabilities(parsedSprintPlan, opts = {}) {
  const errors = [];
  const warnings = [];

  if (!parsedSprintPlan || typeof parsedSprintPlan !== 'object') {
    return { valid: false, errors: ['Parsed sprint plan is null or not an object'], warnings: [] };
  }

  const sprintItems = Array.isArray(parsedSprintPlan.sprintItems)
    ? parsedSprintPlan.sprintItems
    : (Array.isArray(parsedSprintPlan.items) ? parsedSprintPlan.items : []);

  const overrideMap = (opts.defaultCapabilitiesOverride && typeof opts.defaultCapabilitiesOverride === 'object')
    ? opts.defaultCapabilitiesOverride
    : {};

  for (const capability of EHG_VENTURE_DEFAULT_CAPABILITIES) {
    if (isCapabilityPresent(capability, sprintItems)) {
      continue;
    }

    // Capability missing — check override
    const override = overrideMap[capability.capability_id];
    const overrideReasonRaw = override?.override_reason;
    const overrideReason = typeof overrideReasonRaw === 'string' ? overrideReasonRaw.trim() : '';

    if (override === undefined) {
      errors.push(`Missing mandatory capability: ${capability.capability_id} — no override_reason provided`);
      continue;
    }

    if (!overrideReason) {
      // FAIL CLOSED — null/undefined/empty/whitespace-only override_reason is malformed override
      errors.push(`Missing mandatory capability: ${capability.capability_id} — override_reason is empty or malformed`);
      continue;
    }

    warnings.push(`Capability ${capability.capability_id} intentionally omitted: ${overrideReason}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Typed error thrown by analyzeStage19 when validation fails without an
 * authorized override. Distinguishes constraint-violation failures from
 * transient LLM errors so callers can route remediation appropriately.
 */
export class MissingDefaultCapabilityError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'MissingDefaultCapabilityError';
    this.code = 'MISSING_DEFAULT_CAPABILITY';
    this.errors = errors;
  }
}
