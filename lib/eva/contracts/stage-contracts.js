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
      { stage: 4, fields: {
        competitors: { type: 'array', required: false },
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
    consumes: [
      { stage: 1, fields: {
        description: { type: 'string' },
        valueProp: { type: 'string' },
        targetMarket: { type: 'string' },
      }},
    ],
    produces: {
      customerPersonas: { type: 'array', minItems: 3 },
      brandGenome: { type: 'object' },
      candidates: { type: 'array', minItems: 5 },
    },
  }],

  [11, {
    consumes: [
      { stage: 1, fields: {
        description: { type: 'string' },
        targetMarket: { type: 'string' },
      }},
      { stage: 10, fields: {
        customerPersonas: { type: 'array', minItems: 3 },
        brandGenome: { type: 'object' },
      }},
    ],
    produces: {
      candidates: { type: 'array', minItems: 5 },
      visualIdentity: { type: 'object' },
      scoringCriteria: { type: 'array', minItems: 1 },
    },
  }],

  [12, {
    consumes: [
      { stage: 1, fields: {
        description: { type: 'string' },
        targetMarket: { type: 'string' },
      }},
      { stage: 10, fields: {
        customerPersonas: { type: 'array', minItems: 3 },
        brandGenome: { type: 'object' },
      }},
      { stage: 11, fields: {
        candidates: { type: 'array', minItems: 5 },
      }},
    ],
    produces: {
      marketTiers: { type: 'array', minItems: 3 },
      channels: { type: 'array', minItems: 8 },
      salesModel: { type: 'string' },
      deal_stages: { type: 'array', minItems: 3 },
      funnel_stages: { type: 'array', minItems: 4 },
      customer_journey: { type: 'array', minItems: 5 },
      reality_gate: { type: 'object' },
    },
  }],

  [13, {
    consumes: [
      { stage: 1, fields: {
        description: { type: 'string' },
        valueProp: { type: 'string' },
      }},
      { stage: 5, fields: {
        unitEconomics: { type: 'object', required: false },
      }},
      { stage: 8, fields: {
        customerSegments: { type: 'object', required: false },
      }},
      { stage: 9, fields: {
        exit_thesis: { type: 'string', required: false },
      }},
    ],
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
      // Risk register fields (moved from S15 in SD-RESTRUCTURE-STAGE-15-MOVE-ORCH-001-B)
      risks: { type: 'array', minItems: 1 },
      total_risks: { type: 'number' },
    },
  }],

  // SD-RESTRUCTURE-STAGE-15-MOVE-ORCH-001-B: S15 is now Design Studio (wireframes + convergence)
  [15, {
    consumes: [],
    produces: {
      wireframes: { type: 'object', required: false },
      wireframe_convergence: { type: 'object', required: false },
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
        risks: { type: 'array', minItems: 1 },
      }},
    ],
    produces: {
      runway_months: { type: 'number' },
      promotion_gate: { type: 'object' },
    },
  }],

  // SD-LEO-INFRA-BUILD-LOOP-DATA-001: Stage 17 is Blueprint Review gate, produces quality scores
  [17, {
    consumes: [
      { stage: 13, fields: { milestones: { type: 'array' } }},
      { stage: 14, fields: { layers: { type: 'object' }, risks: { type: 'array' } }},
      { stage: 16, fields: { runway_months: { type: 'number' } }},
    ],
    produces: {
      decision: { type: 'string' },
      quality_scores: { type: 'object', required: false },
      gaps: { type: 'array', required: false },
      build_brief: { type: 'object', required: false },
    },
  }],

  [18, {
    consumes: [
      { stage: 13, fields: { milestones: { type: 'array' } }},
      { stage: 14, fields: { layers: { type: 'object' } }},
      { stage: 17, fields: { decision: { type: 'string' } }},
    ],
    produces: {
      checklist: { type: 'object' },
      readiness_pct: { type: 'number' },
      buildReadiness: { type: 'object' },
    },
  }],

  [19, {
    consumes: [
      { stage: 18, fields: {
        buildReadiness: { type: 'object' },
      }},
      { stage: 13, fields: {
        milestones: { type: 'array' },
      }},
      { stage: 14, fields: {
        layers: { type: 'object' },
      }},
      { stage: 17, fields: {
        build_brief: { type: 'object', required: false },
      }},
    ],
    produces: {
      sprint_name: { type: 'string' },
      items: { type: 'array', minItems: 1 },
      total_story_points: { type: 'number' },
    },
  }],

  [20, {
    consumes: [
      { stage: 18, fields: {
        buildReadiness: { type: 'object', required: false },
      }},
      { stage: 19, fields: {
        items: { type: 'array' },
      }},
    ],
    produces: {
      tasks: { type: 'array', minItems: 1 },
      total_tasks: { type: 'number' },
      completed_tasks: { type: 'number' },
    },
  }],

  [21, {
    consumes: [
      { stage: 19, fields: {
        items: { type: 'array' },
      }},
      { stage: 20, fields: {
        tasks: { type: 'array' },
      }},
    ],
    produces: {
      test_suites: { type: 'array', minItems: 1 },
      overall_pass_rate: { type: 'number' },
      quality_gate_passed: { type: 'boolean' },
    },
  }],

  [22, {
    consumes: [
      { stage: 17, fields: {
        decision: { type: 'string' },
      }},
      { stage: 18, fields: {
        readiness_pct: { type: 'number' },
      }},
      { stage: 19, fields: {
        items: { type: 'array', minItems: 1 },
      }},
      { stage: 20, fields: {
        tasks: { type: 'array' },
      }},
      { stage: 21, fields: {
        test_suites: { type: 'array' },
        quality_gate_passed: { type: 'boolean', required: false },
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
      marketing_items: { type: 'array', minItems: 3 },
      sd_bridge_payloads: { type: 'array' },
      marketing_strategy_summary: { type: 'string', minLength: 10 },
    },
  }],

  [24, {
    consumes: [
      { stage: 22, fields: {
        promotion_gate: { type: 'object' },
        releaseDecision: { type: 'object', required: false },
      }},
      { stage: 23, fields: {
        marketing_items: { type: 'array' },
        marketing_readiness_pct: { type: 'number', required: false },
      }},
    ],
    produces: {
      readiness_checklist: { type: 'object' },
      go_no_go_decision: { type: 'string' },
      readiness_score: { type: 'number' },
    },
  }],

  // Stage 25: Launch Readiness (Chairman Gate)
  // Consumes release readiness + marketing data, produces readiness checklist with chairman gate.
  // SD-RCA-PREEMPTIVE-S26: Fixed consumes to reference correct upstream stages.
  [25, {
    consumes: [
      { stage: 23, fields: {
        release_items: { type: 'array', required: false },
        releaseDecision: { type: 'object', required: false },
      }},
      { stage: 24, fields: {
        marketing_items: { type: 'array', required: false },
      }},
    ],
    produces: {
      readiness_checklist: { type: 'object' },
      go_no_go_decision: { type: 'string' },
      readiness_score: { type: 'number' },
      chairmanGate: { type: 'object' },
    },
  }],

  // Stage 26: Launch Execution (Pipeline Terminus)
  // Consumes Stage 25 chairman gate approval and upstream launch data.
  // SD-RCA-PREEMPTIVE-S26: Added missing contract for pipeline terminus.
  [26, {
    consumes: [
      { stage: 25, fields: {
        chairmanGate: { type: 'object' },
        go_no_go_decision: { type: 'string' },
        readiness_score: { type: 'number' },
      }},
    ],
    produces: {
      distribution_channels: { type: 'array', minItems: 1 },
      operations_handoff: { type: 'object' },
      launch_summary: { type: 'string', minLength: 10 },
      pipeline_terminus: { type: 'boolean' },
    },
  }],
]);

/**
 * Get the contract for a specific stage.
 * @param {number} stageNumber - Stage number (1-26)
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
  // Phase 1: THE TRUTH (Stages 1-5)
  1: [0],                    // Hydration: Stage 0 synthesis
  2: [1],                    // Multi-persona scoring: idea brief
  3: [1, 2],                 // Kill gate: idea + persona scores
  4: [1, 3],                 // Competitive intel: idea + kill gate entities
  5: [1, 3, 4],              // Unit economics kill gate: idea + scores + competitors

  // Phase 2: THE ENGINE (Stages 6-9)
  6: [1, 3, 4, 5],           // Risk matrix: idea + scores + competitors + economics
  7: [1, 4, 5, 6],           // Pricing strategy: idea + competitors + economics + risks
  8: [1, 4, 5, 6, 7],        // BMC: idea + competitors + economics + risks + pricing
  9: [1, 5, 6, 7, 8],        // Exit strategy (reality gate): idea + economics + risks + pricing + BMC

  // Phase 3: THE IDENTITY (Stages 10-12)
  10: [1, 3, 5, 8],          // Brand identity: idea + scores + economics + BMC
  11: [1, 5, 10],            // Marketing/GTM: idea + economics + brand
  12: [1, 5, 7, 10, 11],     // Sales framework: idea + economics + pricing + brand + GTM

  // Phase 4: THE BLUEPRINT (Stages 13-16)
  13: [1, 5, 8, 9],          // Product roadmap: idea + economics + BMC + exit
  14: [1, 13],               // Technical architecture: idea + roadmap
  15: [1, 6, 10, 13, 14],    // Risk register + wireframes: idea + risk matrix + brand + roadmap + architecture
  16: [1, 13, 14, 15],       // Financial projections (promotion gate): idea + roadmap + arch + risks

  // Phase 4.5: BLUEPRINT REVIEW GATE (Stage 17)
  17: [13, 14, 15, 16],      // Blueprint review: roadmap + arch + risks + financials

  // Phase 5: THE BUILD LOOP (Stages 18-22)
  // SD-LEO-INFRA-BUILD-LOOP-DATA-001: deps aligned with renamed function params
  18: [13, 14, 15, 16, 17],  // Build readiness: blueprint outputs + blueprint review
  19: [13, 14, 17, 18],      // Sprint planning: roadmap + arch + blueprint review + readiness
  20: [18, 19],              // Build execution: readiness + sprint plan
  21: [19, 20],              // QA & testing: sprint plan + build execution
  22: [17, 18, 19, 20, 21],  // Build review: full build phase
  // Phase 5->6: Release Readiness (Stage 23)
  23: [1, 18, 19, 20, 21, 22], // Release readiness: idea + full build loop stages

  // Phase 6: LAUNCH & LEARN (Stages 24-26)
  24: [1, 22, 23],            // Marketing preparation: idea + build review + release readiness
  25: [23, 24],              // Launch readiness (chairman gate): release + marketing
  26: [23, 24, 25],          // Launch execution (pipeline terminus): release + marketing + chairman approval
};

/**
 * Validate that all upstream dependency artifacts exist before executing a stage.
 * SD-MAN-INFRA-STAGE-DATA-FLOW-001: FR-003
 *
 * @param {number} stageNumber - Stage about to execute
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId - Venture UUID
 * @returns {Promise<{valid: boolean, missingStages: number[], presentStages: number[]}>}
 */
export async function validateDependencyChain(stageNumber, supabase, ventureId) {
  const deps = CROSS_STAGE_DEPS[stageNumber];
  if (!deps || deps.length === 0) {
    return { valid: true, missingStages: [], presentStages: [] };
  }

  const { data: artifacts, error } = await supabase
    .from('venture_artifacts')
    .select('lifecycle_stage')
    .eq('venture_id', ventureId)
    .eq('is_current', true)
    .in('lifecycle_stage', deps);

  if (error) {
    throw new Error(`Failed to query dependency artifacts: ${error.message}`);
  }

  const presentStages = [...new Set((artifacts || []).map(a => a.lifecycle_stage))];
  const missingStages = deps.filter(d => !presentStages.includes(d));

  return {
    valid: missingStages.length === 0,
    missingStages,
    presentStages,
  };
}

/**
 * Report contract enforcement status for all 26 stages of a venture.
 * SD-MAN-INFRA-CORRECTIVE-V05-DATA-CONTRACTS-001: FR-005
 * SD-RCA-PREEMPTIVE-S26: Updated loop to cover all 26 stages.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId - Venture UUID
 * @returns {Promise<Array<{stage: number, enforcement: string, upstreamValid: boolean, missingFields: string[], errors: string[]}>>}
 */
export async function reportContractStatus(supabase, ventureId) {
  // Fetch all current artifacts for this venture
  const { data: artifacts, error } = await supabase
    .from('venture_artifacts')
    .select('lifecycle_stage, content, metadata')
    .eq('venture_id', ventureId)
    .eq('is_current', true);

  if (error) {
    throw new Error(`Failed to fetch venture artifacts: ${error.message}`);
  }

  // Build stage data map
  const stageDataMap = new Map();
  for (const art of artifacts || []) {
    if (!stageDataMap.has(art.lifecycle_stage)) {
      let data = art.metadata || art.content;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { /* keep as string */ }
      }
      stageDataMap.set(art.lifecycle_stage, data);
    }
  }

  const enforcementMode = process.env.EVA_CONTRACT_ENFORCEMENT_MODE === 'advisory'
    ? CONTRACT_ENFORCEMENT.ADVISORY
    : CONTRACT_ENFORCEMENT.BLOCKING;

  const report = [];
  for (let stage = 1; stage <= 26; stage++) {
    const result = validatePreStage(stage, stageDataMap, {
      logger: { log: () => {}, warn: () => {}, error: () => {} },
      enforcement: enforcementMode,
    });

    const contract = STAGE_CONTRACTS.get(stage);
    const missingFields = [];
    if (contract && contract.consumes) {
      for (const dep of contract.consumes) {
        if (!stageDataMap.has(dep.stage)) {
          missingFields.push(...Object.keys(dep.fields).map(f => `stage-${dep.stage}.${f}`));
        }
      }
    }

    report.push({
      stage,
      enforcement: enforcementMode,
      upstreamValid: result.valid,
      missingFields,
      errors: result.errors,
    });
  }

  return report;
}

export { STAGE_CONTRACTS };
