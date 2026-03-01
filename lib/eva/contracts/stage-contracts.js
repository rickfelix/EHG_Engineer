/**
 * Cross-Stage Data Contracts Registry
 * Part of SD-MAN-ORCH-EVA-GOVERNANCE-POLISH-001-B
 *
 * Defines consume/produce contracts per stage. Used by the orchestrator
 * for pre-stage validation (consumed artifacts exist) and post-stage
 * validation (produced artifacts match schema).
 *
 * @module lib/eva/contracts/stage-contracts
 */

import { validateCrossStageContract } from '../stage-templates/validation.js';

/**
 * Stage contracts: each stage declares what it consumes from upstream
 * and what it produces for downstream.
 *
 * Contract format:
 *   consumes: Array<{ stage: number, fields: ContractSpec }>
 *   produces: ContractSpec
 *
 * ContractSpec: { [fieldName]: { type, required?, minLength?, min?, max?, minItems? } }
 */
const STAGE_CONTRACTS = new Map([
  [1, {
    consumes: [],
    produces: {
      description: { type: 'string', minLength: 50 },
      problemStatement: { type: 'string', minLength: 20 },
      valueProp: { type: 'string', minLength: 20 },
      targetMarket: { type: 'string', minLength: 10 },
      archetype: { type: 'string' },
    },
  }],

  [2, {
    consumes: [
      { stage: 1, fields: {
        description: { type: 'string' },
        problemStatement: { type: 'string' },
        valueProp: { type: 'string' },
        targetMarket: { type: 'string' },
        archetype: { type: 'string' },
      }},
    ],
    produces: {
      compositeScore: { type: 'integer', min: 0, max: 100 },
    },
  }],

  [3, {
    consumes: [
      { stage: 1, fields: {
        archetype: { type: 'string' },
        problemStatement: { type: 'string' },
      }},
      { stage: 2, fields: {
        compositeScore: { type: 'integer' },
      }},
    ],
    produces: {
      overallScore: { type: 'integer', min: 0, max: 100 },
      decision: { type: 'string' },
    },
  }],

  [4, {
    consumes: [
      { stage: 1, fields: {
        description: { type: 'string' },
        valueProp: { type: 'string' },
        targetMarket: { type: 'string' },
      }},
      { stage: 3, fields: {
        competitorEntities: { type: 'array', required: false },
      }},
    ],
    produces: {
      competitors: { type: 'array', minItems: 1 },
    },
  }],

  [5, {
    consumes: [
      { stage: 1, fields: {
        archetype: { type: 'string' },
        targetMarket: { type: 'string' },
      }},
    ],
    produces: {
      unitEconomics: { type: 'object' },
      decision: { type: 'string' },
    },
  }],

  [6, {
    consumes: [
      { stage: 5, fields: {
        unitEconomics: { type: 'object' },
      }},
    ],
    produces: {
      risks: { type: 'array', minItems: 1 },
      aggregate_risk_score: { type: 'number' },
      normalized_risk_score: { type: 'number' },
    },
  }],

  [7, {
    consumes: [
      { stage: 5, fields: {
        unitEconomics: { type: 'object' },
      }},
    ],
    produces: {
      pricing_model: { type: 'string' },
      tiers: { type: 'array', minItems: 1 },
    },
  }],

  [8, {
    consumes: [
      { stage: 7, fields: {
        pricing_model: { type: 'string' },
        tiers: { type: 'array', minItems: 1 },
      }},
    ],
    produces: {
      customerSegments: { type: 'object' },
      valuePropositions: { type: 'object' },
      revenueStreams: { type: 'object' },
    },
  }],

  [9, {
    consumes: [
      { stage: 6, fields: {
        risks: { type: 'array' },
        aggregate_risk_score: { type: 'number' },
      }},
      { stage: 7, fields: {
        tiers: { type: 'array', minItems: 1 },
      }},
      { stage: 8, fields: {
        customerSegments: { type: 'object' },
      }},
    ],
    produces: {
      exit_thesis: { type: 'string', minLength: 20 },
      exit_paths: { type: 'array', minItems: 1 },
      reality_gate: { type: 'object' },
    },
  }],

  [10, {
    consumes: [],
    produces: {
      candidates: { type: 'array', minItems: 5 },
      brandGenome: { type: 'object' },
    },
  }],

  [11, {
    consumes: [],
    produces: {
      tiers: { type: 'array', minItems: 3 },
      channels: { type: 'array', minItems: 8 },
    },
  }],

  [12, {
    consumes: [
      { stage: 10, fields: {
        candidates: { type: 'array', minItems: 5 },
      }},
      { stage: 11, fields: {
        tiers: { type: 'array', minItems: 3 },
        channels: { type: 'array', minItems: 8 },
      }},
    ],
    produces: {
      sales_model: { type: 'string' },
      deal_stages: { type: 'array', minItems: 3 },
      funnel_stages: { type: 'array', minItems: 4 },
      reality_gate: { type: 'object' },
    },
  }],

  [13, {
    consumes: [],
    produces: {
      vision_statement: { type: 'string', minLength: 20 },
      milestones: { type: 'array', minItems: 3 },
      decision: { type: 'string' },
    },
  }],

  [14, {
    consumes: [],
    produces: {
      architecture_summary: { type: 'string', minLength: 20 },
      layers: { type: 'object' },
      dataEntities: { type: 'array', minItems: 1 },
    },
  }],

  [15, {
    consumes: [],
    produces: {
      risks: { type: 'array', minItems: 1 },
      total_risks: { type: 'number' },
    },
  }],

  [16, {
    consumes: [
      { stage: 13, fields: {
        milestones: { type: 'array', minItems: 3 },
        decision: { type: 'string' },
      }},
      { stage: 14, fields: {
        layers: { type: 'object' },
      }},
      { stage: 15, fields: {
        risks: { type: 'array', minItems: 1 },
      }},
    ],
    produces: {
      runway_months: { type: 'number' },
      promotion_gate: { type: 'object' },
    },
  }],

  [17, {
    consumes: [],
    produces: {
      checklist: { type: 'object' },
      readiness_pct: { type: 'number' },
      buildReadiness: { type: 'object' },
    },
  }],

  [18, {
    consumes: [],
    produces: {
      sprint_name: { type: 'string' },
      items: { type: 'array', minItems: 1 },
      total_story_points: { type: 'number' },
    },
  }],

  [19, {
    consumes: [
      { stage: 18, fields: {
        items: { type: 'array', minItems: 1 },
      }},
    ],
    produces: {
      tasks: { type: 'array', minItems: 1 },
      completion_pct: { type: 'number' },
      sprintCompletion: { type: 'object' },
    },
  }],

  [20, {
    consumes: [],
    produces: {
      test_suites: { type: 'array', minItems: 1 },
      overall_pass_rate: { type: 'number' },
      quality_gate_passed: { type: 'object' },
    },
  }],

  [21, {
    consumes: [],
    produces: {
      integrations: { type: 'array', minItems: 1 },
      pass_rate: { type: 'number' },
      all_passing: { type: 'object' },
    },
  }],

  [22, {
    consumes: [
      { stage: 17, fields: {
        buildReadiness: { type: 'object' },
      }},
      { stage: 18, fields: {
        items: { type: 'array', minItems: 1 },
      }},
      { stage: 19, fields: {
        sprintCompletion: { type: 'object' },
      }},
      { stage: 20, fields: {
        quality_gate_passed: { type: 'object' },
      }},
      { stage: 21, fields: {
        reviewDecision: { type: 'object', required: false },
      }},
    ],
    produces: {
      release_items: { type: 'array', minItems: 1 },
      release_notes: { type: 'string', minLength: 10 },
      promotion_gate: { type: 'object' },
    },
  }],

  [23, {
    consumes: [
      { stage: 22, fields: {
        promotion_gate: { type: 'object' },
        releaseDecision: { type: 'object', required: false },
      }},
    ],
    produces: {
      go_decision: { type: 'string' },
      launch_tasks: { type: 'array', minItems: 1 },
      decision: { type: 'string' },
    },
  }],

  [24, {
    consumes: [],
    produces: {
      aarrr: { type: 'object' },
      learnings: { type: 'array' },
      launchOutcome: { type: 'object' },
    },
  }],

  [25, {
    consumes: [
      { stage: 1, fields: {
        description: { type: 'string' },
        problemStatement: { type: 'string' },
      }},
      { stage: 24, fields: {
        launchOutcome: { type: 'object' },
      }},
    ],
    produces: {
      review_summary: { type: 'string', minLength: 20 },
      ventureDecision: { type: 'object' },
      drift_detected: { type: 'object' },
    },
  }],
]);

/**
 * Get the contract for a specific stage.
 * @param {number} stageNumber - Stage number (1-25)
 * @returns {{ consumes: Array<{stage: number, fields: Object}>, produces: Object } | null}
 */
export function getContract(stageNumber) {
  return STAGE_CONTRACTS.get(stageNumber) || null;
}

/**
 * Validate pre-stage: check that consumed upstream data contains required fields.
 *
 * @param {number} stageNumber - The stage about to execute
 * @param {Map<number, Object>|Object} upstreamData - Map of stage number → output data,
 *   or a flat object (treated as the immediate predecessor's output)
 * @param {{ logger?: Object }} [options]
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
/**
 * Enforcement mode for contract validation.
 * Part of SD-MAN-ORCH-VISION-HEAL-SCORE-93-001-05-C
 */
export const CONTRACT_ENFORCEMENT = {
  ADVISORY: 'advisory',   // Log warnings, don't block
  BLOCKING: 'blocking',   // Return errors that block stage execution
};

export function validatePreStage(stageNumber, upstreamData, { logger = console, enforcement = CONTRACT_ENFORCEMENT.BLOCKING } = {}) {
  const contract = STAGE_CONTRACTS.get(stageNumber);
  if (!contract || contract.consumes.length === 0) {
    return { valid: true, errors: [], warnings: [] };
  }

  const allErrors = [];
  const warnings = [];

  for (const dep of contract.consumes) {
    const stageData = upstreamData instanceof Map
      ? upstreamData.get(dep.stage)
      : upstreamData;

    if (!stageData) {
      const hasRequired = Object.values(dep.fields).some(f => f.required !== false);
      if (hasRequired) {
        // SD-MAN-GEN-CORRECTIVE-VISION-GAP-012 (V05): Missing upstream with required fields is an error, not a warning
        allErrors.push(`Stage ${stageNumber}: upstream stage-${String(dep.stage).padStart(2, '0')} data missing (has required fields)`);
      } else {
        warnings.push(`Stage ${stageNumber}: upstream stage-${String(dep.stage).padStart(2, '0')} data not available (optional)`);
      }
      continue;
    }

    const result = validateCrossStageContract(stageData, dep.fields, `stage-${String(dep.stage).padStart(2, '0')}`);
    if (!result.valid) {
      allErrors.push(...result.errors);
    }
  }

  if (allErrors.length > 0) {
    const level = enforcement === CONTRACT_ENFORCEMENT.BLOCKING ? 'error' : 'warn';
    logger[level](`[Eva][Contract] Pre-stage ${stageNumber} validation: ${allErrors.length} error(s) [${enforcement}]`, { errors: allErrors });
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings,
    enforcement,
    blocked: enforcement === CONTRACT_ENFORCEMENT.BLOCKING && allErrors.length > 0,
  };
}

/**
 * Validate post-stage: check that produced output contains required fields.
 *
 * @param {number} stageNumber - The stage that just executed
 * @param {Object} stageOutput - The output from template execution
 * @param {{ logger?: Object }} [options]
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validatePostStage(stageNumber, stageOutput, { logger = console, enforcement = CONTRACT_ENFORCEMENT.BLOCKING } = {}) {
  const contract = STAGE_CONTRACTS.get(stageNumber);
  if (!contract || !contract.produces || Object.keys(contract.produces).length === 0) {
    return { valid: true, errors: [], warnings: [] };
  }

  const result = validateCrossStageContract(stageOutput, contract.produces, `stage-${String(stageNumber).padStart(2, '0')}-output`);

  if (!result.valid) {
    const level = enforcement === CONTRACT_ENFORCEMENT.BLOCKING ? 'error' : 'warn';
    logger[level](`[Eva][Contract] Post-stage ${stageNumber} validation: ${result.errors.length} error(s) [${enforcement}]`, { errors: result.errors });
  }

  return {
    valid: result.valid,
    errors: result.errors,
    warnings: [],
    enforcement,
    blocked: enforcement === CONTRACT_ENFORCEMENT.BLOCKING && !result.valid,
  };
}

/**
 * Cross-stage dependency map for execution engine.
 * Defines which upstream stages are required for each stage's analysisStep.
 * Moved from stage-execution-engine.js for centralization.
 * SD-MAN-ORCH-VISION-ARCHITECTURE-HARDENING-001-D
 */
export const CROSS_STAGE_DEPS = {
  1: [0],              // Stage 1 needs Stage 0 synthesis
  3: [1, 2],           // Kill gate: needs idea + validation
  5: [1, 3, 4],        // Kill gate: needs idea + market + competitor
  8: [1, 2, 3, 4, 5, 6, 7], // BMC: synthesizes all prior
  9: [1, 5, 8],        // Reality gate: needs idea + financial + BMC
  13: [1, 5, 9, 10, 11, 12], // Kill gate: needs full identity
  16: [1, 5, 7, 13, 14, 15], // P&L: needs pricing + planning
  22: [17, 18, 19, 20, 21],  // UAT: needs full build
  25: [22, 23, 24],    // Ops review: needs launch data
};

export { STAGE_CONTRACTS };
