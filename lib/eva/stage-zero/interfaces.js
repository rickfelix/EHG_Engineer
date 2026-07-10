/**
 * Stage 0 Shared Interfaces
 *
 * Defines the contract between path handlers and the synthesis step.
 * All three entry paths (competitor teardown, blueprint browse, discovery mode)
 * produce a PathOutput that feeds into synthesis.
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-B
 */

// SD-LEO-INFRA-STAGE0-THESIS-CONTRACT-001: the thesis/kills/decisions contract seam.
import { validateVentureThesis, validateKillCriteria, validateExplicitDecisions, THESIS_CORE_FIELDS } from './thesis-contract.js';

/**
 * Validate a PathOutput object.
 * Every path handler must produce output conforming to this shape.
 *
 * @param {Object} output - The path output to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePathOutput(output) {
  const errors = [];

  if (!output || typeof output !== 'object') {
    return { valid: false, errors: ['PathOutput must be a non-null object'] };
  }

  // Required fields
  if (!output.origin_type || typeof output.origin_type !== 'string') {
    errors.push('origin_type is required (string)');
  }
  if (!output.raw_material || typeof output.raw_material !== 'object') {
    errors.push('raw_material is required (object)');
  }
  if (!output.suggested_name || typeof output.suggested_name !== 'string') {
    errors.push('suggested_name is required (string)');
  }
  if (!output.suggested_problem || typeof output.suggested_problem !== 'string') {
    errors.push('suggested_problem is required (string)');
  }
  if (!output.suggested_solution || typeof output.suggested_solution !== 'string') {
    errors.push('suggested_solution is required (string)');
  }
  if (!output.target_market || typeof output.target_market !== 'string') {
    errors.push('target_market is required (string)');
  }

  // Validate origin_type enum
  const validOrigins = ['competitor_teardown', 'blueprint', 'discovery', 'manual', 'nursery_reeval', 'seeded_from_venture'];
  if (output.origin_type && !validOrigins.includes(output.origin_type)) {
    errors.push(`origin_type must be one of: ${validOrigins.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a SynthesisInput object.
 * The synthesis step receives path output + additional context.
 *
 * @param {Object} input - The synthesis input to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSynthesisInput(input) {
  const errors = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['SynthesisInput must be a non-null object'] };
  }

  const pathValidation = validatePathOutput(input.pathOutput);
  if (!pathValidation.valid) {
    errors.push(...pathValidation.errors.map(e => `pathOutput.${e}`));
  }

  // Optional enrichments (populated by synthesis components)
  if (input.intellectualCapital !== undefined && !Array.isArray(input.intellectualCapital)) {
    errors.push('intellectualCapital must be an array if provided');
  }
  if (input.portfolioContext !== undefined && typeof input.portfolioContext !== 'object') {
    errors.push('portfolioContext must be an object if provided');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a VentureBrief — the Stage 0 output that feeds Stage 1.
 *
 * SD-LEO-INFRA-STAGE0-THESIS-CONTRACT-001 (spec R3+R5): a brief is only a valid
 * Stage-Zero output when it carries a falsifiable THESIS (who pays / for what / reached
 * how / at what price + a pre-build demand-test plan), PRE-REGISTERED KILL CRITERIA as
 * machine-consumable contracts, and the EXPLICIT-DECISIONS block (form factor first).
 * A bare composite score with none of these is REJECTED here — while a scoreless brief
 * with a full thesis remains representable (no score field is required).
 *
 * @param {Object} brief - The venture brief to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateVentureBrief(brief) {
  const errors = [];

  if (!brief || typeof brief !== 'object') {
    return { valid: false, errors: ['VentureBrief must be a non-null object'] };
  }

  const requiredStrings = ['name', 'problem_statement', 'solution', 'target_market', 'origin_type'];
  for (const field of requiredStrings) {
    if (!brief[field] || typeof brief[field] !== 'string' || brief[field].trim() === '') {
      errors.push(`${field} is required (non-empty string)`);
    }
  }

  if (!brief.raw_chairman_intent || typeof brief.raw_chairman_intent !== 'string') {
    errors.push('raw_chairman_intent is required (immutable chairman vision)');
  }

  // maturity determines where the venture goes
  const validMaturities = ['ready', 'seed', 'sprout', 'blocked', 'nursery'];
  if (brief.maturity && !validMaturities.includes(brief.maturity)) {
    errors.push(`maturity must be one of: ${validMaturities.join(', ')}`);
  }

  // THESIS CONTRACT — an incomplete thesis is representable (incomplete_fields honesty)
  // but its incompleteness must be DECLARED, and CORE-incomplete (cannot state who pays
  // for what / no testable plan) must not claim maturity 'ready'. SOFT-incomplete
  // (price_point/reached_how) stays 'ready'-eligible: the demand-test plan is the
  // instrument that refines those fields (PR #5809 adversarial round-1).
  const thesisCheck = validateVentureThesis(brief.thesis);
  if (!thesisCheck.valid) {
    const declaredIncomplete = Array.isArray(brief.thesis?.incomplete_fields) && brief.thesis.incomplete_fields.length > 0;
    if (!declaredIncomplete) {
      errors.push(...thesisCheck.errors.map((e) => `thesis contract: ${e}`));
    } else {
      const coreIncomplete = brief.thesis.incomplete_fields.filter((f) => THESIS_CORE_FIELDS.includes(f));
      if (coreIncomplete.length > 0 && brief.maturity === 'ready') {
        errors.push(`thesis contract: core-incomplete thesis (${coreIncomplete.join(', ')}) cannot carry maturity 'ready' — demote to 'seed'`);
      }
    }
  }

  const killCheck = validateKillCriteria(brief.kill_criteria);
  if (!killCheck.valid) {
    errors.push(...killCheck.errors.map((e) => `kill contract: ${e}`));
  }

  const decisionCheck = validateExplicitDecisions(brief.explicit_decisions);
  if (!decisionCheck.valid) {
    errors.push(...decisionCheck.errors.map((e) => `decision contract: ${e}`));
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Create a minimal PathOutput with defaults.
 *
 * @param {Object} overrides - Fields to set on the path output
 * @returns {Object} PathOutput
 */
export function createPathOutput(overrides = {}) {
  return {
    origin_type: 'manual',
    raw_material: {},
    suggested_name: '',
    suggested_problem: '',
    suggested_solution: '',
    target_market: '',
    competitor_urls: [],
    blueprint_id: null,
    discovery_strategy: null,
    metadata: {},
    ...overrides,
  };
}
