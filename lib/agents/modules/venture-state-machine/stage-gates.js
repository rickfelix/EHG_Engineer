/**
 * VentureStateMachine - Stage Gates Module
 *
 * SD-INDUSTRIAL-2025-001: Stage-Specific Gate Validation
 * SD-LEO-INFRA-STAGE-GATES-EXT-001: Kill & Promotion Gates
 *
 * Validates business rules for critical stage transitions.
 * Integrates with Decision Filter Engine for threshold evaluation.
 *
 * Gate Types:
 *   EXISTING  - Original artifact-based gates (5->6, 21->22, 22->23)
 *   KILL      - Venture termination checkpoints (stages 3, 5, 13, 23)
 *   PROMOTION - Advancement approval gates (stages 16, 17, 22)
 *
 * @module lib/agents/modules/venture-state-machine/stage-gates
 */

import { evaluateDecision } from '../../../eva/decision-filter-engine.js';
import { ChairmanPreferenceStore } from '../../../eva/chairman-preference-store.js';
import { randomUUID } from 'crypto';

// ── Gate Configuration ──────────────────────────────────────────────

/**
 * Kill gate stages: checkpoints where ventures may be terminated
 * if Filter Engine thresholds fail.
 */
const KILL_GATE_STAGES = new Set([3, 5, 13, 23]);

/**
 * Promotion gate stages: checkpoints where ventures need
 * Chairman approval to advance when thresholds pass.
 */
const PROMOTION_GATE_STAGES = new Set([16, 17, 22]);

/**
 * Gate type enum for structured results.
 */
const GATE_TYPE = Object.freeze({
  EXISTING: 'EXISTING',
  KILL: 'KILL',
  PROMOTION: 'PROMOTION',
});

/**
 * Gate status enum.
 */
const GATE_STATUS = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  REQUIRES_CHAIRMAN_DECISION: 'REQUIRES_CHAIRMAN_DECISION',
  REQUIRES_CHAIRMAN_APPROVAL: 'REQUIRES_CHAIRMAN_APPROVAL',
  ERROR: 'ERROR',
});

// ── Preference keys used by Filter Engine ───────────────────────────

const FILTER_PREFERENCE_KEYS = [
  'filter.cost_max_usd',
  'filter.min_score',
  'filter.approved_tech_list',
  'filter.approved_vendor_list',
  'filter.pivot_keywords',
];

// ── Public API ──────────────────────────────────────────────────────

/**
 * Validate stage gate for a venture transition.
 *
 * Dispatches to the appropriate gate type:
 *   1. Existing artifact-based gates (5->6, 21->22, 22->23)
 *   2. Kill gates (entering stages 3, 5, 13, 23)
 *   3. Promotion gates (entering stages 16, 17, 22)
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture ID
 * @param {number} fromStage - Current stage
 * @param {number} toStage - Target stage
 * @param {Object} [options] - Extended options
 * @param {string} [options.chairmanId] - Chairman ID for preference resolution
 * @param {Object} [options.stageOutput] - Stage output data for Filter Engine
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<Object>} Gate result with standardized contract
 */
export async function validateStageGate(supabase, ventureId, fromStage, toStage, options = {}) {
  const transition = `${fromStage}->${toStage}`;
  const logger = options.logger || console;
  logger.log(`   Checking stage gate for transition ${transition}`);

  // Check existing artifact-based gates first (FR-4: preserve with zero regressions)
  switch (transition) {
    case '5->6':
      return validateFinancialViabilityGate(supabase, ventureId);
    case '21->22':
      return validateUATSignoffGate(supabase, ventureId);
    case '22->23':
      return validateDeploymentHealthGate(supabase, ventureId);
  }

  // Check kill gates (FR-1)
  if (KILL_GATE_STAGES.has(toStage)) {
    return evaluateKillGate(supabase, ventureId, fromStage, toStage, options);
  }

  // Check promotion gates (FR-2)
  if (PROMOTION_GATE_STAGES.has(toStage)) {
    return evaluatePromotionGate(supabase, ventureId, fromStage, toStage, options);
  }

  // No specific gate for this transition
  return { passed: true, gate_name: null, details: { message: 'No stage-specific gate required' } };
}

/**
 * Check if a given target stage has a kill or promotion gate.
 * @param {number} toStage - Target stage number
 * @returns {{ isGated: boolean, gateType: string|null }}
 */
export function getGateType(toStage) {
  if (KILL_GATE_STAGES.has(toStage)) return { isGated: true, gateType: GATE_TYPE.KILL };
  if (PROMOTION_GATE_STAGES.has(toStage)) return { isGated: true, gateType: GATE_TYPE.PROMOTION };
  return { isGated: false, gateType: null };
}

// ── Kill Gate (FR-1) ────────────────────────────────────────────────

/**
 * Evaluate a kill gate for a venture stage transition.
 *
 * Kill gates evaluate Filter Engine thresholds and:
 *   - PASS if all thresholds pass (venture continues)
 *   - REQUIRES_CHAIRMAN_DECISION if any threshold fails
 *   - ERROR on system failures (fail-closed per FR-3)
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture ID
 * @param {number} fromStage - Current stage
 * @param {number} toStage - Target stage
 * @param {Object} options - { chairmanId, stageOutput, logger }
 * @returns {Promise<Object>} Kill gate result
 */
async function evaluateKillGate(supabase, ventureId, fromStage, toStage, options = {}) {
  const correlationId = randomUUID();
  const logger = options.logger || console;
  logger.log(`   Evaluating Kill Gate for stage ${toStage} [${correlationId}]`);

  try {
    const { preferences, stageInput } = await resolveGateContext(
      supabase, ventureId, toStage, options
    );

    const filterResult = evaluateDecision(stageInput, { preferences, logger });

    const evaluatedThresholds = filterResult.triggers.map(t => ({
      thresholdId: t.type,
      expected: t.details?.threshold ?? null,
      actual: t.details?.cost ?? t.details?.score ?? null,
      pass: false,
      severity: t.severity,
      message: t.message,
    }));

    // Kill gate: all thresholds must pass for auto-proceed
    if (filterResult.auto_proceed) {
      const summary = buildSummary(GATE_TYPE.KILL, toStage, GATE_STATUS.PASS, evaluatedThresholds);
      return {
        passed: true,
        gate_name: `KILL_GATE_STAGE_${toStage}`,
        gateType: GATE_TYPE.KILL,
        status: GATE_STATUS.PASS,
        summary,
        details: {
          correlationId,
          stage: toStage,
          evaluatedThresholds,
          recommendation: filterResult.recommendation,
          message: summary,
        },
      };
    }

    // Thresholds failed - requires Chairman decision
    const summary = buildSummary(GATE_TYPE.KILL, toStage, GATE_STATUS.REQUIRES_CHAIRMAN_DECISION, evaluatedThresholds);
    return {
      passed: false,
      gate_name: `KILL_GATE_STAGE_${toStage}`,
      gateType: GATE_TYPE.KILL,
      status: GATE_STATUS.REQUIRES_CHAIRMAN_DECISION,
      summary,
      details: {
        correlationId,
        stage: toStage,
        evaluatedThresholds,
        recommendation: filterResult.recommendation,
        message: summary,
      },
    };
  } catch (err) {
    // Fail-closed on errors (FR-3)
    logger.error(`   Kill Gate ERROR at stage ${toStage}: ${err.message}`);
    const summary = `Kill gate error at stage ${toStage}. System failure requires investigation.`;
    return {
      passed: false,
      gate_name: `KILL_GATE_STAGE_${toStage}`,
      gateType: GATE_TYPE.KILL,
      status: GATE_STATUS.ERROR,
      summary,
      details: {
        correlationId,
        stage: toStage,
        error: err.message,
        evaluatedThresholds: [],
        message: summary,
      },
    };
  }
}

// ── Promotion Gate (FR-2) ───────────────────────────────────────────

/**
 * Evaluate a promotion gate for a venture stage transition.
 *
 * Promotion gates evaluate Filter Engine thresholds and:
 *   - FAIL if any HIGH-severity threshold fails (venture cannot advance)
 *   - REQUIRES_CHAIRMAN_APPROVAL if thresholds pass but Chairman must confirm
 *   - ERROR on system failures (fail-closed per FR-3)
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture ID
 * @param {number} fromStage - Current stage
 * @param {number} toStage - Target stage
 * @param {Object} options - { chairmanId, stageOutput, logger }
 * @returns {Promise<Object>} Promotion gate result
 */
async function evaluatePromotionGate(supabase, ventureId, fromStage, toStage, options = {}) {
  const correlationId = randomUUID();
  const logger = options.logger || console;
  logger.log(`   Evaluating Promotion Gate for stage ${toStage} [${correlationId}]`);

  try {
    const { preferences, stageInput } = await resolveGateContext(
      supabase, ventureId, toStage, options
    );

    const filterResult = evaluateDecision(stageInput, { preferences, logger });

    const evaluatedThresholds = filterResult.triggers.map(t => ({
      thresholdId: t.type,
      expected: t.details?.threshold ?? null,
      actual: t.details?.cost ?? t.details?.score ?? null,
      pass: false,
      severity: t.severity,
      message: t.message,
    }));

    // Any HIGH severity trigger blocks promotion
    const hasHighSeverity = filterResult.triggers.some(t => t.severity === 'HIGH');
    if (hasHighSeverity) {
      const summary = buildSummary(GATE_TYPE.PROMOTION, toStage, GATE_STATUS.FAIL, evaluatedThresholds);
      return {
        passed: false,
        gate_name: `PROMOTION_GATE_STAGE_${toStage}`,
        gateType: GATE_TYPE.PROMOTION,
        status: GATE_STATUS.FAIL,
        summary,
        details: {
          correlationId,
          stage: toStage,
          evaluatedThresholds,
          recommendation: filterResult.recommendation,
          message: summary,
        },
      };
    }

    // Thresholds pass (or only MEDIUM/INFO) - requires Chairman approval to advance
    const summary = buildSummary(GATE_TYPE.PROMOTION, toStage, GATE_STATUS.REQUIRES_CHAIRMAN_APPROVAL, evaluatedThresholds);
    return {
      passed: false, // Not auto-passed; Chairman must approve
      gate_name: `PROMOTION_GATE_STAGE_${toStage}`,
      gateType: GATE_TYPE.PROMOTION,
      status: GATE_STATUS.REQUIRES_CHAIRMAN_APPROVAL,
      summary,
      details: {
        correlationId,
        stage: toStage,
        evaluatedThresholds,
        recommendation: filterResult.recommendation,
        message: summary,
      },
    };
  } catch (err) {
    // Fail-closed on errors (FR-3)
    logger.error(`   Promotion Gate ERROR at stage ${toStage}: ${err.message}`);
    const summary = `Promotion gate error at stage ${toStage}. System failure requires investigation.`;
    return {
      passed: false,
      gate_name: `PROMOTION_GATE_STAGE_${toStage}`,
      gateType: GATE_TYPE.PROMOTION,
      status: GATE_STATUS.ERROR,
      summary,
      details: {
        correlationId,
        stage: toStage,
        error: err.message,
        evaluatedThresholds: [],
        message: summary,
      },
    };
  }
}

// ── Shared Helpers ──────────────────────────────────────────────────

/**
 * Resolve gate context: load chairman preferences and build stage input.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture ID
 * @param {number} toStage - Target stage
 * @param {Object} options - { chairmanId, stageOutput, sdId, sdPhase }
 * @param {string} [options.sdId] - SD key for vision score lookup
 * @param {string} [options.sdPhase] - SD phase override (if not provided, read from DB)
 * @returns {Promise<{ preferences: Object, stageInput: Object }>}
 */
async function resolveGateContext(supabase, ventureId, toStage, options = {}) {
  const { chairmanId, stageOutput = {}, sdId, sdPhase } = options;

  // Load chairman preferences for Filter Engine
  let preferences = {};
  if (chairmanId) {
    const store = new ChairmanPreferenceStore({ supabaseClient: supabase });
    const resolved = await store.getPreferences({
      chairmanId,
      ventureId,
      keys: FILTER_PREFERENCE_KEYS,
    });
    for (const [key, pref] of resolved) {
      preferences[key] = pref.value;
    }
  }

  // Load vision score from strategic_directives_v2 when SD context is available
  let visionScore = null;
  let resolvedSdPhase = sdPhase || null;
  if (sdId) {
    const { data: sdData } = await supabase
      .from('strategic_directives_v2')
      .select('vision_score, current_phase')
      .eq('sd_key', sdId)
      .single();

    if (sdData) {
      visionScore = sdData.vision_score ?? null;
      if (!resolvedSdPhase) {
        resolvedSdPhase = sdData.current_phase || null;
      }
    }
  }

  // Build stage input for Filter Engine
  const stageInput = {
    stage: String(toStage),
    cost: stageOutput.cost ?? undefined,
    score: stageOutput.score ?? undefined,
    technologies: stageOutput.technologies ?? [],
    vendors: stageOutput.vendors ?? [],
    description: stageOutput.description ?? '',
    patterns: stageOutput.patterns ?? [],
    priorPatterns: stageOutput.priorPatterns ?? [],
    constraints: stageOutput.constraints ?? {},
    approvedConstraints: stageOutput.approvedConstraints ?? {},
    visionScore,
    sdPhase: resolvedSdPhase,
  };

  return { preferences, stageInput };
}

/**
 * Build a chairman-friendly summary string (<=240 chars per FR-5).
 *
 * @param {string} gateType - KILL or PROMOTION
 * @param {number} stage - Stage number
 * @param {string} status - Gate status
 * @param {Array} evaluatedThresholds - Threshold evaluation results
 * @returns {string} Summary string <=240 characters
 */
function buildSummary(gateType, stage, status, evaluatedThresholds) {
  const failedCount = evaluatedThresholds.length;
  const label = gateType === GATE_TYPE.KILL ? 'Kill' : 'Promotion';

  let summary;
  switch (status) {
    case GATE_STATUS.PASS:
      summary = `${label} gate at stage ${stage}: PASSED. All thresholds met. Venture may proceed.`;
      break;
    case GATE_STATUS.FAIL:
      summary = `${label} gate at stage ${stage}: BLOCKED. ${failedCount} threshold(s) failed. Venture cannot advance until issues resolved.`;
      break;
    case GATE_STATUS.REQUIRES_CHAIRMAN_DECISION:
      summary = `${label} gate at stage ${stage}: ${failedCount} threshold(s) failed. Chairman decision required: continue or terminate venture.`;
      break;
    case GATE_STATUS.REQUIRES_CHAIRMAN_APPROVAL:
      summary = failedCount > 0
        ? `${label} gate at stage ${stage}: ${failedCount} minor issue(s) noted. Chairman approval required to advance.`
        : `${label} gate at stage ${stage}: All thresholds met. Chairman approval required to advance.`;
      break;
    case GATE_STATUS.ERROR:
      summary = `${label} gate at stage ${stage}: System error. Investigation required before proceeding.`;
      break;
    default:
      summary = `${label} gate at stage ${stage}: Status ${status}.`;
  }

  // Enforce 240-char limit
  if (summary.length > 240) {
    summary = summary.slice(0, 237) + '...';
  }
  return summary;
}

// ── Existing Gates (Preserved - FR-4) ───────────────────────────────

/**
 * Financial Viability Gate (Stage 5->6)
 * Validates business model before proceeding to GTM stages
 * Checks: pricing_model artifact exists with valid unit economics
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture ID
 * @returns {Promise<Object>} Gate result
 */
async function validateFinancialViabilityGate(supabase, ventureId) {
  console.log('   Validating Financial Viability Gate (5->6)');

  const gateResult = {
    passed: false,
    gate_name: 'FINANCIAL_VIABILITY',
    checks: [],
    details: {}
  };

  // Check 1: pricing_model artifact exists
  const { data: pricingArtifact, error: pricingError } = await supabase
    .from('venture_artifacts')
    .select('artifact_data, created_at')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 7) // Stage 7 is Pricing Strategy
    .eq('artifact_type', 'pricing_model')
    .eq('is_current', true)
    .single();

  if (pricingError || !pricingArtifact) {
    gateResult.checks.push({ check: 'pricing_model_exists', passed: false, reason: 'No pricing model artifact found' });
    gateResult.details.missing_artifact = 'pricing_model';
    return gateResult;
  }
  gateResult.checks.push({ check: 'pricing_model_exists', passed: true });

  // Check 2: business_model_canvas artifact exists
  const { data: bmcArtifact, error: bmcError } = await supabase
    .from('venture_artifacts')
    .select('artifact_data, created_at')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 8) // Stage 8 is BMC
    .eq('artifact_type', 'business_model_canvas')
    .eq('is_current', true)
    .single();

  if (bmcError || !bmcArtifact) {
    gateResult.checks.push({ check: 'bmc_exists', passed: false, reason: 'No business model canvas found' });
    gateResult.details.missing_artifact = 'business_model_canvas';
    return gateResult;
  }
  gateResult.checks.push({ check: 'bmc_exists', passed: true });

  // Check 3: Validate pricing data has required fields
  const pricingData = pricingArtifact.artifact_data;
  const hasRevenueStreams = pricingData?.revenueStreams?.length > 0 || pricingData?.tiers?.length > 0;
  if (!hasRevenueStreams) {
    gateResult.checks.push({ check: 'revenue_streams_defined', passed: false, reason: 'No revenue streams or pricing tiers defined' });
    return gateResult;
  }
  gateResult.checks.push({ check: 'revenue_streams_defined', passed: true });

  gateResult.passed = true;
  gateResult.details = {
    pricing_artifact_date: pricingArtifact.created_at,
    bmc_artifact_date: bmcArtifact.created_at,
    message: 'Financial viability validated - pricing model and BMC present'
  };

  console.log('   Financial Viability Gate PASSED');
  return gateResult;
}

/**
 * UAT Programmatic Signoff Gate (Stage 21->22)
 * Validates all UAT scenarios passed before deployment
 * Checks: test_coverage_report artifact with 100% UAT pass rate
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture ID
 * @returns {Promise<Object>} Gate result
 */
async function validateUATSignoffGate(supabase, ventureId) {
  console.log('   Validating UAT Signoff Gate (21->22)');

  const gateResult = {
    passed: false,
    gate_name: 'UAT_SIGNOFF',
    checks: [],
    details: {}
  };

  // Check 1: test_coverage_report artifact exists
  const { data: testArtifact, error: testError } = await supabase
    .from('venture_artifacts')
    .select('artifact_data, created_at')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 21)
    .eq('artifact_type', 'test_coverage_report')
    .eq('is_current', true)
    .single();

  if (testError || !testArtifact) {
    gateResult.checks.push({ check: 'test_report_exists', passed: false, reason: 'No test coverage report found' });
    gateResult.details.missing_artifact = 'test_coverage_report';
    return gateResult;
  }
  gateResult.checks.push({ check: 'test_report_exists', passed: true });

  // Check 2: Validate UAT scenarios completion
  const testData = testArtifact.artifact_data;
  const uatScenarios = testData?.uatScenarios || [];
  const passedScenarios = uatScenarios.filter(s => s.status === 'passed').length;
  const totalScenarios = uatScenarios.length;
  const uatPassRate = totalScenarios > 0 ? (passedScenarios / totalScenarios) * 100 : 0;

  if (uatPassRate < 100) {
    gateResult.checks.push({
      check: 'uat_100_percent_pass',
      passed: false,
      reason: `UAT pass rate ${uatPassRate.toFixed(1)}% < 100% required`,
      details: { passed: passedScenarios, total: totalScenarios, rate: uatPassRate }
    });
    gateResult.details.uat_pass_rate = uatPassRate;
    gateResult.details.scenarios_remaining = totalScenarios - passedScenarios;
    return gateResult;
  }
  gateResult.checks.push({ check: 'uat_100_percent_pass', passed: true, details: { rate: uatPassRate } });

  // Check 3: Validate automated test suites pass rate
  const testSuites = testData?.testSuites || [];
  const totalTests = testSuites.reduce((sum, s) => sum + (s.total || 0), 0);
  const passedTests = testSuites.reduce((sum, s) => sum + (s.passed || 0), 0);
  const automatedPassRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

  if (automatedPassRate < 95) { // Allow 5% tolerance for flaky tests
    gateResult.checks.push({
      check: 'automated_tests_threshold',
      passed: false,
      reason: `Automated test pass rate ${automatedPassRate.toFixed(1)}% < 95% threshold`,
      details: { passed: passedTests, total: totalTests, rate: automatedPassRate }
    });
    return gateResult;
  }
  gateResult.checks.push({ check: 'automated_tests_threshold', passed: true, details: { rate: automatedPassRate } });

  gateResult.passed = true;
  gateResult.details = {
    uat_pass_rate: uatPassRate,
    automated_pass_rate: automatedPassRate,
    total_uat_scenarios: totalScenarios,
    total_automated_tests: totalTests,
    message: 'UAT signoff validated - all scenarios passed, automated tests at threshold'
  };

  console.log(`   UAT Signoff Gate PASSED (UAT: ${uatPassRate}%, Automated: ${automatedPassRate.toFixed(1)}%)`);
  return gateResult;
}

/**
 * Deployment Health Verification Gate (Stage 22->23)
 * Validates deployment readiness before production launch
 * Checks: deployment_runbook artifact with all checklist items complete
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture ID
 * @returns {Promise<Object>} Gate result
 */
async function validateDeploymentHealthGate(supabase, ventureId) {
  console.log('   Validating Deployment Health Gate (22->23)');

  const gateResult = {
    passed: false,
    gate_name: 'DEPLOYMENT_HEALTH',
    checks: [],
    details: {}
  };

  // Check 1: deployment_runbook artifact exists
  const { data: deployArtifact, error: deployError } = await supabase
    .from('venture_artifacts')
    .select('artifact_data, created_at')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 22)
    .eq('artifact_type', 'deployment_runbook')
    .eq('is_current', true)
    .single();

  if (deployError || !deployArtifact) {
    gateResult.checks.push({ check: 'runbook_exists', passed: false, reason: 'No deployment runbook found' });
    gateResult.details.missing_artifact = 'deployment_runbook';
    return gateResult;
  }
  gateResult.checks.push({ check: 'runbook_exists', passed: true });

  // Check 2: All infrastructure configured
  const deployData = deployArtifact.artifact_data;
  const infrastructure = deployData?.infrastructure || [];
  const configuredCount = infrastructure.filter(i => i.status === 'configured').length;
  const totalInfra = infrastructure.length;
  const infraReady = totalInfra > 0 && configuredCount === totalInfra;

  if (!infraReady) {
    gateResult.checks.push({
      check: 'infrastructure_configured',
      passed: false,
      reason: `Infrastructure ${configuredCount}/${totalInfra} configured`,
      details: { configured: configuredCount, total: totalInfra }
    });
    gateResult.details.infrastructure_gap = totalInfra - configuredCount;
    return gateResult;
  }
  gateResult.checks.push({ check: 'infrastructure_configured', passed: true });

  // Check 3: Deployment checklist complete
  const checklist = deployData?.checklist || [];
  const checkedCount = checklist.filter(c => c.checked === true).length;
  const totalChecklist = checklist.length;
  const checklistComplete = totalChecklist > 0 && checkedCount === totalChecklist;

  if (!checklistComplete) {
    gateResult.checks.push({
      check: 'checklist_complete',
      passed: false,
      reason: `Deployment checklist ${checkedCount}/${totalChecklist} complete`,
      details: { checked: checkedCount, total: totalChecklist }
    });
    gateResult.details.checklist_remaining = totalChecklist - checkedCount;
    gateResult.details.unchecked_items = checklist.filter(c => !c.checked).map(c => c.item);
    return gateResult;
  }
  gateResult.checks.push({ check: 'checklist_complete', passed: true });

  // Check 4: At least one environment active
  const environments = deployData?.environments || [];
  const activeEnvs = environments.filter(e => e.status === 'active').length;
  if (activeEnvs === 0) {
    gateResult.checks.push({
      check: 'environment_active',
      passed: false,
      reason: 'No active environments found'
    });
    return gateResult;
  }
  gateResult.checks.push({ check: 'environment_active', passed: true, details: { active_envs: activeEnvs } });

  gateResult.passed = true;
  gateResult.details = {
    infrastructure_ready: `${configuredCount}/${totalInfra}`,
    checklist_complete: `${checkedCount}/${totalChecklist}`,
    active_environments: activeEnvs,
    message: 'Deployment health validated - infrastructure configured, checklist complete'
  };

  console.log(`   Deployment Health Gate PASSED (Infra: ${configuredCount}/${totalInfra}, Checklist: ${checkedCount}/${totalChecklist})`);
  return gateResult;
}

// ── Exported constants for testing ──────────────────────────────────

export {
  KILL_GATE_STAGES,
  PROMOTION_GATE_STAGES,
  GATE_TYPE,
  GATE_STATUS,
  FILTER_PREFERENCE_KEYS,
};

// Internal exports for unit testing
export const _internal = {
  evaluateKillGate,
  evaluatePromotionGate,
  resolveGateContext,
  buildSummary,
  validateFinancialViabilityGate,
  validateUATSignoffGate,
  validateDeploymentHealthGate,
};
