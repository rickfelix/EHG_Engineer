/**
 * VentureStateMachine - CEO-owned venture stage transitions
 *
 * SD-VISION-V2-005: Vision V2 Venture CEO Runtime & Factory
 * Spec Reference: docs/vision/specs/06-hierarchical-agent-architecture.md Section 10
 *
 * SD-HARDENING-V2-002C: Idempotency & Persistence
 * - Pending handoffs now persisted to pending_ceo_handoffs table
 * - fn_advance_venture_stage supports idempotency_key for duplicate prevention
 *
 * SD-UNIFIED-PATH-1.2.1: JIT Truth Check Pattern
 * - stageStates Map is now a READ-THROUGH CACHE, not source of truth
 * - verifyStateFreshness() called before ANY mutation
 * - StateStalenessError thrown if cache/db mismatch detected
 * - Write-through to venture_stage_work on state changes
 *
 * SD-HARDENING-V2-003: Golden Nugget Validation
 * - Validate artifact CONTENT against stages_v2.yaml requirements
 * - Enforce quality gates: existence is NOT enough
 * - Block stage transitions when artifacts don't meet minimum quality standards
 * - Delegated to golden-nugget-validator.js module
 *
 * CEO owns state machine:
 * - Only CEO can commit stage transitions
 * - VPs propose handoffs, CEO reviews and commits
 * - Integrates with fn_advance_venture_stage()
 */

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import {
  validateGoldenNuggets,
  getStageRequirements
} from './golden-nugget-validator.js';

/**
 * SD-UNIFIED-PATH-1.2.1: Custom error for stale state detection
 * Thrown when cached state differs from database state
 * isRetryable=true indicates caller should rehydrate and retry
 */
export class StateStalenessError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'StateStalenessError';
    this.isRetryable = true;
    this.cachedStage = details.cachedStage;
    this.dbStage = details.dbStage;
    this.ventureId = details.ventureId;
  }
}

/**
 * SD-HARDENING-V2-003: Golden Nugget validation failure error
 * Thrown when artifacts fail quality validation
 * Contains detailed validation results for feedback
 */
export class GoldenNuggetValidationError extends Error {
  constructor(message, validationResults = {}) {
    super(message);
    this.name = 'GoldenNuggetValidationError';
    this.validationResults = validationResults;
  }
}

/**
 * SD-INDUSTRIAL-2025-001: Stage Gate validation failure error
 * Thrown when stage-specific business rules are not met
 * Contains detailed gate check results for feedback
 */
export class StageGateValidationError extends Error {
  constructor(message, gateResults = {}) {
    super(message);
    this.name = 'StageGateValidationError';
    this.gateResults = gateResults;
  }
}

/**
 * Handoff package structure for VP -> CEO handoffs
 */
const REQUIRED_HANDOFF_FIELDS = [
  'artifacts',
  'key_decisions',
  'open_questions',
  'risks_identified'
];

/**
 * VentureStateMachine - Manages CEO-owned venture stage transitions
 */
export class VentureStateMachine {
  constructor(options = {}) {
    this.supabase = options.supabaseClient || createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    this.ventureId = options.ventureId;
    this.ceoAgentId = options.ceoAgentId;

    // SD-UNIFIED-PATH-1.2.1: Initialization guard - prevents operations before rehydration
    this._initialized = false;

    // SD-UNIFIED-PATH-1.2.1: READ-THROUGH CACHE - database is source of truth
    // stageStates is now a cache, not the authoritative source
    this.currentStage = null;
    this.stageStates = new Map();
    // SD-HARDENING-V2-002C: pendingHandoffs now backed by pending_ceo_handoffs table
    this.pendingHandoffsCache = new Map();
  }

  /**
   * Initialize state machine by loading current venture state
   */
  async initialize() {
    console.log(`\n📊 Initializing state machine for venture ${this.ventureId}`);

    // Load venture current stage
    const { data: venture, error } = await this.supabase
      .from('ventures')
      .select('id, name, current_lifecycle_stage, status')
      .eq('id', this.ventureId)
      .single();

    if (error || !venture) {
      throw new Error(`Failed to load venture: ${error?.message || 'Not found'}`);
    }

    this.currentStage = venture.current_lifecycle_stage || 1;
    console.log(`   Current stage: ${this.currentStage}`);

    // Load stage work status
    const { data: stageWork } = await this.supabase
      .from('venture_stage_work')
      .select('lifecycle_stage, stage_status, health_score')
      .eq('venture_id', this.ventureId);

    if (stageWork) {
      for (const sw of stageWork) {
        this.stageStates.set(sw.lifecycle_stage, {
          status: sw.stage_status,
          health_score: sw.health_score
        });
      }
    }

    console.log(`   Stages loaded: ${this.stageStates.size}`);

    // SD-HARDENING-V2-002C: Load pending handoffs from database
    await this._loadPendingHandoffs();
    console.log(`   Pending handoffs: ${this.pendingHandoffsCache.size}`);

    // SD-UNIFIED-PATH-1.2.1: Mark as initialized - safe for operations
    this._initialized = true;
    console.log('   ✅ State machine initialized (JIT Truth Check enabled)');

    return this;
  }

  /**
   * SD-UNIFIED-PATH-1.2.1: Ensure state machine is initialized before operations
   * @throws {Error} If not initialized
   * @private
   */
  async _ensureInitialized() {
    if (!this._initialized) {
      console.log('   ⏳ State machine not initialized, rehydrating from database...');
      await this.initialize();
    }
  }

  /**
   * SD-UNIFIED-PATH-1.2.1: JIT Truth Check - verify cache freshness before mutations
   * Compares cached currentStage with database and rehydrates if stale
   * @throws {StateStalenessError} If cache differs from database (retryable)
   */
  async verifyStateFreshness() {
    const { data: venture, error } = await this.supabase
      .from('ventures')
      .select('current_lifecycle_stage')
      .eq('id', this.ventureId)
      .single();

    if (error) {
      throw new Error(`JIT Truth Check failed: ${error.message}`);
    }

    const dbStage = venture.current_lifecycle_stage;

    if (dbStage !== this.currentStage) {
      console.warn(`   ⚠️  STALE STATE DETECTED: cache=${this.currentStage}, db=${dbStage}`);

      // Rehydrate from database
      await this.initialize();

      // Throw retryable error - caller should retry with fresh state
      throw new StateStalenessError(
        'State cache invalidated. Rehydration complete, please retry.',
        {
          cachedStage: this.currentStage,
          dbStage: dbStage,
          ventureId: this.ventureId
        }
      );
    }

    return true;
  }

  /**
   * Load pending handoffs from database into cache
   * SD-HARDENING-V2-002C: Database-backed persistence
   * @private
   */
  async _loadPendingHandoffs() {
    const { data: pendingHandoffs, error } = await this.supabase
      .from('pending_ceo_handoffs')
      .select('*')
      .eq('venture_id', this.ventureId)
      .eq('status', 'pending');

    if (error) {
      console.warn(`   ⚠️  Failed to load pending handoffs: ${error.message}`);
      return;
    }

    this.pendingHandoffsCache.clear();
    if (pendingHandoffs) {
      for (const handoff of pendingHandoffs) {
        this.pendingHandoffsCache.set(handoff.id, {
          id: handoff.id,
          vp_agent_id: handoff.vp_agent_id,
          from_stage: handoff.from_stage,
          to_stage: handoff.to_stage,
          package: handoff.handoff_data,
          proposed_at: handoff.proposed_at,
          status: handoff.status
        });
      }
    }
  }

  /**
   * SD-HARDENING-V2-003: Get stage requirements from stages_v2.yaml
   * Delegated to golden-nugget-validator module
   *
   * @param {number} stageId - Stage ID to get requirements for
   * @returns {Object} Stage requirements (artifacts, gates, epistemic)
   */
  getStageRequirements(stageId) {
    return getStageRequirements(stageId);
  }

  /**
   * SD-INDUSTRIAL-2025-001: Stage-Specific Gate Validation
   * Validates business rules for critical stage transitions
   * Called BEFORE Golden Nugget validation in _approveHandoff
   *
   * @param {number} fromStage - Current stage
   * @param {number} toStage - Target stage
   * @returns {Object} { passed: boolean, gate_name: string, details: object }
   */
  async _validateStageGate(fromStage, toStage) {
    const transition = `${fromStage}→${toStage}`;
    console.log(`   🚦 Checking stage gate for transition ${transition}`);

    switch (transition) {
      case '5→6':
        return this._validateFinancialViabilityGate();
      case '21→22':
        return this._validateUATSignoffGate();
      case '22→23':
        return this._validateDeploymentHealthGate();
      default:
        // No specific gate for this transition
        return { passed: true, gate_name: null, details: { message: 'No stage-specific gate required' } };
    }
  }

  /**
   * Financial Viability Gate (Stage 5→6)
   * Validates business model before proceeding to GTM stages
   * Checks: pricing_model artifact exists with valid unit economics
   */
  async _validateFinancialViabilityGate() {
    console.log('   💰 Validating Financial Viability Gate (5→6)');

    const gateResult = {
      passed: false,
      gate_name: 'FINANCIAL_VIABILITY',
      checks: [],
      details: {}
    };

    // Check 1: pricing_model artifact exists
    const { data: pricingArtifact, error: pricingError } = await this.supabase
      .from('venture_artifacts')
      .select('artifact_data, created_at')
      .eq('venture_id', this.ventureId)
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
    const { data: bmcArtifact, error: bmcError } = await this.supabase
      .from('venture_artifacts')
      .select('artifact_data, created_at')
      .eq('venture_id', this.ventureId)
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

    console.log('   ✅ Financial Viability Gate PASSED');
    return gateResult;
  }

  /**
   * UAT Programmatic Signoff Gate (Stage 21→22)
   * Validates all UAT scenarios passed before deployment
   * Checks: test_coverage_report artifact with 100% UAT pass rate
   */
  async _validateUATSignoffGate() {
    console.log('   🧪 Validating UAT Signoff Gate (21→22)');

    const gateResult = {
      passed: false,
      gate_name: 'UAT_SIGNOFF',
      checks: [],
      details: {}
    };

    // Check 1: test_coverage_report artifact exists
    const { data: testArtifact, error: testError } = await this.supabase
      .from('venture_artifacts')
      .select('artifact_data, created_at')
      .eq('venture_id', this.ventureId)
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

    console.log(`   ✅ UAT Signoff Gate PASSED (UAT: ${uatPassRate}%, Automated: ${automatedPassRate.toFixed(1)}%)`);
    return gateResult;
  }

  /**
   * Deployment Health Verification Gate (Stage 22→23)
   * Validates deployment readiness before production launch
   * Checks: deployment_runbook artifact with all checklist items complete
   */
  async _validateDeploymentHealthGate() {
    console.log('   🚀 Validating Deployment Health Gate (22→23)');

    const gateResult = {
      passed: false,
      gate_name: 'DEPLOYMENT_HEALTH',
      checks: [],
      details: {}
    };

    // Check 1: deployment_runbook artifact exists
    const { data: deployArtifact, error: deployError } = await this.supabase
      .from('venture_artifacts')
      .select('artifact_data, created_at')
      .eq('venture_id', this.ventureId)
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

    console.log(`   ✅ Deployment Health Gate PASSED (Infra: ${configuredCount}/${totalInfra}, Checklist: ${checkedCount}/${totalChecklist})`);
    return gateResult;
  }

  /**
   * Truth Layer: Log prediction before state transition
   * @param {Object} predictionData - Predicted outcome
   * @param {string} correlationId - Operation correlation ID
   * @returns {string} prediction_event_id for outcome linking
   */
  async logPrediction(predictionData, correlationId = null) {
    const idempotencyKey = uuidv4();
    const actualCorrelationId = correlationId || uuidv4();

    const { data, error } = await this.supabase
      .from('system_events')
      .insert({
        event_type: 'AGENT_PREDICTION',
        correlation_id: actualCorrelationId,
        idempotency_key: idempotencyKey,
        event_data: {
          predicted_outcome: predictionData,
          agent_id: this.ceoAgentId,
          venture_id: this.ventureId,
          timestamp: new Date().toISOString()
        },
        metadata: {
          source: 'VentureStateMachine',
          prediction_type: predictionData.action || 'unknown'
        }
      })
      .select('id')
      .single();

    if (error) {
      console.warn(`   [TRUTH] Prediction logging failed: ${error.message}`);
      return null;
    }

    console.log(`   [TRUTH] Prediction logged: ${data.id}`);
    return data.id;
  }

  /**
   * Truth Layer: Log actual outcome and compute calibration delta
   * @param {string} predictionEventId - ID from logPrediction
   * @param {Object} actualOutcome - Actual outcome data
   * @param {Object} prediction - Original prediction for delta calculation
   */
  async logOutcome(predictionEventId, actualOutcome, prediction = {}) {
    if (!predictionEventId) {
      console.warn('   [TRUTH] No prediction event ID provided for outcome logging');
      return;
    }

    const calibrationDelta = this._computeCalibrationDelta(prediction, actualOutcome);

    const { error } = await this.supabase
      .from('system_events')
      .insert({
        event_type: 'AGENT_OUTCOME',
        parent_event_id: predictionEventId,
        event_data: {
          actual_outcome: actualOutcome,
          calibration_delta: calibrationDelta,
          agent_id: this.ceoAgentId,
          venture_id: this.ventureId,
          timestamp: new Date().toISOString()
        },
        metadata: {
          source: 'VentureStateMachine',
          calibration_accuracy: calibrationDelta.accuracy_score || 0
        }
      });

    if (error) {
      console.warn(`   [TRUTH] Outcome logging failed: ${error.message}`);
      return;
    }

    console.log(`   [TRUTH] Outcome logged (accuracy: ${(calibrationDelta.accuracy_score * 100).toFixed(1)}%)`);
  }

  /**
   * Compute calibration delta between prediction and outcome
   * @private
   */
  _computeCalibrationDelta(prediction, outcome) {
    const delta = {
      fields_compared: [],
      differences: {},
      accuracy_score: 1.0
    };

    // Compare stage transition success
    if (prediction.expected_success !== undefined && outcome.success !== undefined) {
      const successMatch = prediction.expected_success === outcome.success;
      delta.fields_compared.push('success');
      delta.differences.success = {
        predicted: prediction.expected_success,
        actual: outcome.success,
        match: successMatch
      };
      if (!successMatch) {
        delta.accuracy_score *= 0.1; // 90% penalty for transition failure
      }
    }

    // Compare stage advancement
    if (prediction.from_stage && prediction.to_stage && outcome.new_stage) {
      const stageMatch = outcome.new_stage === prediction.to_stage;
      delta.fields_compared.push('stage');
      delta.differences.stage = {
        predicted_from: prediction.from_stage,
        predicted_to: prediction.to_stage,
        actual: outcome.new_stage,
        match: stageMatch
      };
      if (!stageMatch) {
        delta.accuracy_score *= 0.3; // 70% penalty for wrong stage
      }
    }

    // Compare action outcome
    if (prediction.action && outcome.action) {
      const actionMatch = prediction.action === outcome.action;
      delta.fields_compared.push('action');
      delta.differences.action = {
        predicted: prediction.action,
        actual: outcome.action,
        match: actionMatch
      };
      if (!actionMatch) {
        delta.accuracy_score *= 0.5; // 50% penalty for action mismatch
      }
    }

    return delta;
  }

  getCurrentStage() {
    return this.currentStage;
  }

  getStageState(stageId) {
    return this.stageStates.get(stageId) || { status: 'pending', health_score: null };
  }

  /**
   * VP proposes handoff - CEO must review and commit
   * SD-UNIFIED-PATH-1.2.1: Ensures initialization before operation
   * RULE 1 COMPLIANCE: Atomic Mutation - verifyStateFreshness() first
   */
  async proposeHandoff(proposal) {
    // SD-UNIFIED-PATH-1.2.1: Ensure state machine is ready
    await this._ensureInitialized();

    // RULE 1: Atomic Mutation - JIT Truth Check before ANY DB write
    await this.verifyStateFreshness();

    const {
      vpAgentId,
      fromStage,
      artifacts = [],
      key_decisions = [],
      open_questions = [],
      risks_identified = []
    } = proposal;

    console.log(`\n📋 Handoff proposal received from VP for stage ${fromStage}`);

    const validation = this._validateHandoffPackage({
      artifacts,
      key_decisions,
      open_questions,
      risks_identified
    });

    if (!validation.valid) {
      console.log(`   ❌ Invalid handoff: ${validation.errors.join(', ')}`);
      return { accepted: false, errors: validation.errors, status: 'rejected' };
    }

    // SD-HARDENING-V2-002C: Persist handoff to database
    const handoffPackage = { artifacts, key_decisions, open_questions, risks_identified };

    try {
      const { data: handoffId, error } = await this.supabase
        .rpc('fn_create_pending_handoff', {
          p_venture_id: this.ventureId,
          p_from_stage: fromStage,
          p_to_stage: fromStage + 1,
          p_vp_agent_id: vpAgentId,
          p_handoff_data: handoffPackage
        });

      if (error) {
        console.error(`   ❌ Failed to persist handoff: ${error.message}`);
        return { accepted: false, errors: [`Database persistence failed: ${error.message}`], status: 'rejected' };
      }

      this.pendingHandoffsCache.set(handoffId, {
        id: handoffId,
        vp_agent_id: vpAgentId,
        from_stage: fromStage,
        to_stage: fromStage + 1,
        package: handoffPackage,
        proposed_at: new Date().toISOString(),
        status: 'pending'
      });

      console.log(`   ✅ Handoff ${handoffId} persisted and queued for CEO review`);
      return { accepted: true, handoff_id: handoffId, status: 'pending_ceo_review' };
    } catch (err) {
      console.error(`   ❌ Unexpected error: ${err.message}`);
      return { accepted: false, errors: [err.message], status: 'rejected' };
    }
  }

  /**
   * CEO reviews and commits stage transition
   * SD-UNIFIED-PATH-1.2.1: Ensures initialization before operation
   * RULE 1 COMPLIANCE: Atomic Mutation - verifyStateFreshness() first
   */
  async commitStageTransition(commitRequest) {
    // SD-UNIFIED-PATH-1.2.1: Ensure state machine is ready
    await this._ensureInitialized();

    // RULE 1: Atomic Mutation - JIT Truth Check before ANY DB write
    await this.verifyStateFreshness();

    const { handoffId, ceoAgentId, decision, ceo_notes = '' } = commitRequest;

    console.log(`\n🔐 CEO committing stage transition decision: ${decision}`);

    const isValidCeo = await this._verifyCeoAuthority(ceoAgentId);
    if (!isValidCeo) {
      throw new Error('UNAUTHORIZED: Only CEO agent can commit stage transitions');
    }

    // SD-HARDENING-V2-002C: Check cache first, then database
    let handoff = this.pendingHandoffsCache.get(handoffId);
    if (!handoff) {
      const { data, error } = await this.supabase
        .from('pending_ceo_handoffs')
        .select('*')
        .eq('id', handoffId)
        .eq('status', 'pending')
        .single();

      if (error || !data) {
        throw new Error(`Handoff ${handoffId} not found or already processed`);
      }

      handoff = {
        id: data.id,
        vp_agent_id: data.vp_agent_id,
        from_stage: data.from_stage,
        to_stage: data.to_stage,
        package: data.handoff_data,
        proposed_at: data.proposed_at,
        status: data.status
      };
    }

    switch (decision) {
      case 'approve':
        return this._approveHandoff(handoff, ceo_notes);
      case 'reject':
        return this._rejectHandoff(handoff, ceo_notes);
      case 'request_changes':
        return this._requestChanges(handoff, ceo_notes);
      default:
        throw new Error(`Invalid decision: ${decision}`);
    }
  }

  /**
   * Approve handoff and advance stage
   * SD-HARDENING-V2-002C: Added idempotency support
   * SD-UNIFIED-PATH-1.2.1: JIT Truth Check + Write-Through
   * SD-HARDENING-V2-003: Golden Nugget validation BEFORE transition
   * TRUTH LAYER: Log prediction before, outcome after
   * @private
   */
  async _approveHandoff(handoff, ceo_notes) {
    // SD-UNIFIED-PATH-1.2.1: JIT Truth Check BEFORE any mutation
    // Throws StateStalenessError if cache is stale (retryable)
    await this.verifyStateFreshness();

    console.log(`   ✅ Approving handoff for stage ${handoff.from_stage}`);

    // SD-INDUSTRIAL-2025-001: VALIDATE STAGE-SPECIFIC GATES FIRST
    // Business rule gates checked BEFORE artifact quality gates
    const stageGateResult = await this._validateStageGate(handoff.from_stage, handoff.to_stage);

    if (!stageGateResult.passed) {
      console.error('\n🚫 STAGE GATE VALIDATION FAILED - TRANSITION BLOCKED');
      console.error(`   Gate: ${stageGateResult.gate_name}`);
      console.error(`   Stage ${handoff.from_stage} → ${handoff.to_stage} REJECTED`);
      console.error(`   Failed checks: ${stageGateResult.checks.filter(c => !c.passed).map(c => c.check).join(', ')}`);

      // Log gate failure to system events
      await this.supabase.from('system_events').insert({
        event_type: 'STAGE_GATE_VALIDATION_FAILURE',
        correlation_id: handoff.id,
        event_data: {
          venture_id: this.ventureId,
          from_stage: handoff.from_stage,
          to_stage: handoff.to_stage,
          gate_name: stageGateResult.gate_name,
          gate_results: stageGateResult,
          timestamp: new Date().toISOString()
        },
        metadata: {
          source: 'VentureStateMachine',
          severity: 'high'
        }
      });

      // Throw gate validation error with detailed feedback
      throw new StageGateValidationError(
        `Stage gate validation failed: ${stageGateResult.gate_name}. ` +
        `Failed checks: ${stageGateResult.checks.filter(c => !c.passed).map(c => c.reason).join('; ')}. ` +
        'Transition blocked until gate requirements are met.',
        stageGateResult
      );
    }

    if (stageGateResult.gate_name) {
      console.log(`   ✅ Stage Gate ${stageGateResult.gate_name} PASSED - proceeding to artifact validation`);
    }

    // SD-HARDENING-V2-003: VALIDATE GOLDEN NUGGETS BEFORE TRANSITION
    // THE LAW: Existence is NOT enough. Quality is MANDATORY.
    // Delegated to golden-nugget-validator module
    const validationResults = await validateGoldenNuggets(
      handoff.from_stage,
      handoff.package.artifacts || []
    );

    if (!validationResults.passed) {
      console.error('\n🚫 GOLDEN NUGGET VALIDATION FAILED - TRANSITION BLOCKED');
      console.error(`   Stage ${handoff.from_stage} → ${handoff.to_stage} REJECTED`);
      console.error(`   Missing artifacts: ${validationResults.missing_artifacts.length}`);
      console.error(`   Quality failures: ${validationResults.quality_failures.length}`);
      console.error(`   Epistemic gaps: ${validationResults.epistemic_gaps.length}`);

      // Log validation failure to system events
      await this.supabase.from('system_events').insert({
        event_type: 'GOLDEN_NUGGET_VALIDATION_FAILURE',
        correlation_id: handoff.id,
        event_data: {
          venture_id: this.ventureId,
          from_stage: handoff.from_stage,
          to_stage: handoff.to_stage,
          validation_results: validationResults,
          timestamp: new Date().toISOString()
        },
        metadata: {
          source: 'VentureStateMachine',
          severity: 'high'
        }
      });

      // Throw validation error with detailed feedback
      throw new GoldenNuggetValidationError(
        `Golden Nugget validation failed for stage ${handoff.from_stage}. ` +
        `Missing: ${validationResults.missing_artifacts.join(', ')}. ` +
        `Quality issues: ${validationResults.quality_failures.map(f => f.artifact_type).join(', ')}. ` +
        'Transition blocked until artifacts meet quality standards.',
        validationResults
      );
    }

    console.log('   ✅ Golden Nugget validation PASSED - proceeding with transition');

    // TRUTH LAYER: Log prediction before RPC
    const prediction = {
      action: 'stage_transition',
      from_stage: handoff.from_stage,
      to_stage: handoff.to_stage,
      expected_success: true
    };
    const predictionEventId = await this.logPrediction(prediction, handoff.id);

    const idempotencyKey = uuidv4();
    const startTime = Date.now();

    // SD-HARDENING-V2-002B: fn_advance_venture_stage is the ONLY gateway for stage transitions
    // No fallback to direct updates - gateway enforces audit trail compliance
    const { data: result, error } = await this.supabase
      .rpc('fn_advance_venture_stage', {
        p_venture_id: this.ventureId,
        p_from_stage: handoff.from_stage,
        p_to_stage: handoff.to_stage,
        p_handoff_data: {
          ...handoff.package,
          stage_gate_validation: stageGateResult, // SD-INDUSTRIAL-2025-001: Include gate proof
          golden_nugget_validation: validationResults, // Include validation proof
          ceo_approval: {
            ceo_agent_id: this.ceoAgentId,
            approved_at: new Date().toISOString(),
            notes: ceo_notes
          }
        },
        p_idempotency_key: idempotencyKey
      });

    const executionTime = Date.now() - startTime;

    if (error) {
      // TRUTH LAYER: Log failure outcome
      const outcome = {
        action: 'stage_transition',
        success: false,
        error: error.message,
        execution_time_ms: executionTime
      };
      await this.logOutcome(predictionEventId, outcome, prediction);

      // SD-HARDENING-V2-002B: Structured error logging for RPC failures
      console.error('🚨 GATEWAY RPC FAILURE:', JSON.stringify({
        venture_id: this.ventureId,
        from_stage: handoff.from_stage,
        to_stage: handoff.to_stage,
        idempotency_key: idempotencyKey,
        error_message: error.message,
        timestamp: new Date().toISOString()
      }, null, 2));

      // SD-HARDENING-V2-002B: Throw on all errors - no fallback to direct updates
      // Vision V2 mandates fn_advance_venture_stage as single gateway for audit trail compliance
      throw new Error(`Stage transition failed: ${error.message}. ` +
        `Venture: ${this.ventureId}, From: ${handoff.from_stage}, To: ${handoff.to_stage}. ` +
        'Gateway fn_advance_venture_stage() is required for audit trail compliance.');
    }

    const wasDuplicate = result?.was_duplicate === true;
    if (wasDuplicate) {
      console.log('   ℹ️  Duplicate transition detected (idempotent) - no action taken');
    }

    // TRUTH LAYER: Log success outcome
    const outcome = {
      action: 'stage_transition',
      success: true,
      new_stage: handoff.to_stage,
      was_duplicate: wasDuplicate,
      execution_time_ms: executionTime,
      golden_nugget_validation_passed: true
    };
    await this.logOutcome(predictionEventId, outcome, prediction);

    // Resolve pending handoff in database
    await this.supabase.rpc('fn_resolve_pending_handoff', {
      p_handoff_id: handoff.id,
      p_status: 'approved',
      p_reviewed_by: this.ceoAgentId,
      p_review_notes: ceo_notes
    });

    this.currentStage = handoff.to_stage;
    this.stageStates.set(handoff.from_stage, { status: 'completed', health_score: 'green' });
    this.pendingHandoffsCache.delete(handoff.id);

    // SD-UNIFIED-PATH-1.2.1: Write-through to venture_stage_work
    // Ensures stage state survives server restart
    const { error: upsertError } = await this.supabase
      .from('venture_stage_work')
      .upsert({
        venture_id: this.ventureId,
        lifecycle_stage: handoff.from_stage,
        stage_status: 'completed',
        health_score: 'green',
        updated_at: new Date().toISOString()
      }, { onConflict: 'venture_id,lifecycle_stage' });

    if (upsertError) {
      console.warn(`   ⚠️  Write-through to venture_stage_work failed: ${upsertError.message}`);
      // Non-fatal: RPC already updated the venture, this is just cache sync
    }

    console.log(`   ✅ Venture advanced to stage ${this.currentStage}`);

    return {
      success: true,
      was_duplicate: wasDuplicate,
      new_stage: this.currentStage,
      transition_logged: true,
      stage_gate_validation: stageGateResult, // SD-INDUSTRIAL-2025-001
      golden_nugget_validation: validationResults,
      idempotency_key: result?.idempotency_key || idempotencyKey
    };
  }

  /**
   * Reject handoff
   * SD-HARDENING-V2-002C: Persist rejection to database
   * RULE 1 COMPLIANCE: Atomic Mutation - verifyStateFreshness() first
   * @private
   */
  async _rejectHandoff(handoff, ceo_notes) {
    // RULE 1: Atomic Mutation - JIT Truth Check before ANY DB write
    await this.verifyStateFreshness();

    console.log(`   ❌ Rejecting handoff for stage ${handoff.from_stage}`);

    const { error } = await this.supabase.rpc('fn_resolve_pending_handoff', {
      p_handoff_id: handoff.id,
      p_status: 'rejected',
      p_reviewed_by: this.ceoAgentId,
      p_review_notes: ceo_notes
    });

    if (error) {
      console.warn(`   ⚠️  Failed to persist rejection: ${error.message}`);
    }

    this.pendingHandoffsCache.delete(handoff.id);
    return { success: true, status: 'rejected', stage_unchanged: this.currentStage };
  }

  /**
   * Request changes from VP
   * SD-HARDENING-V2-002C: Persist changes_requested to database
   * RULE 1 COMPLIANCE: Atomic Mutation - verifyStateFreshness() first
   * @private
   */
  async _requestChanges(handoff, ceo_notes) {
    // RULE 1: Atomic Mutation - JIT Truth Check before ANY DB write
    await this.verifyStateFreshness();

    console.log(`   ↩️  Requesting changes for stage ${handoff.from_stage}`);

    const { error } = await this.supabase.rpc('fn_resolve_pending_handoff', {
      p_handoff_id: handoff.id,
      p_status: 'changes_requested',
      p_reviewed_by: this.ceoAgentId,
      p_review_notes: ceo_notes
    });

    if (error) {
      console.warn(`   ⚠️  Failed to persist changes_requested: ${error.message}`);
    }

    handoff.status = 'changes_requested';
    this.pendingHandoffsCache.set(handoff.id, handoff);

    return {
      success: true,
      status: 'changes_requested',
      required_changes: ceo_notes,
      stage_unchanged: this.currentStage
    };
  }

  async _verifyCeoAuthority(agentId) {
    const { data } = await this.supabase
      .from('agent_registry')
      .select('agent_type')
      .eq('id', agentId)
      .single();

    return data?.agent_type === 'venture_ceo';
  }

  _validateHandoffPackage(pkg) {
    const errors = [];

    for (const field of REQUIRED_HANDOFF_FIELDS) {
      if (!pkg[field] || (Array.isArray(pkg[field]) && pkg[field].length === 0)) {
        if (field === 'artifacts' || field === 'key_decisions') {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    if (pkg.artifacts) {
      for (const artifact of pkg.artifacts) {
        if (!artifact.type || !artifact.content) {
          errors.push('Artifact missing type or content');
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  getSummary() {
    return {
      venture_id: this.ventureId,
      ceo_agent_id: this.ceoAgentId,
      current_stage: this.currentStage,
      stages_completed: Array.from(this.stageStates.entries())
        .filter(([_, s]) => s.status === 'completed').length,
      pending_handoffs: this.pendingHandoffsCache.size
    };
  }

  async getPendingHandoffs() {
    const { data, error } = await this.supabase
      .rpc('fn_get_pending_handoffs', { p_venture_id: this.ventureId });

    if (error) {
      console.warn(`   ⚠️  Failed to get pending handoffs: ${error.message}`);
      return Array.from(this.pendingHandoffsCache.values());
    }

    return data || [];
  }
}

export default VentureStateMachine;
