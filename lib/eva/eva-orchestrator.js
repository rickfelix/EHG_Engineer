/**
 * Eva Orchestrator v1
 *
 * SD-LEO-FEAT-EVA-ORCHESTRATOR-001
 * Core orchestration loop: load venture context, determine current stage,
 * load stage template, execute sub-agents, run through filter engine,
 * persist artifacts, advance stage.
 *
 * Integrates:
 *   - VentureContextManager (context loading)
 *   - ChairmanPreferenceStore (preference loading)
 *   - VentureStateMachine (stage resolution & transitions)
 *   - Decision Filter Engine (auto-proceed/review/stop)
 *   - Stage Gates & Reality Gates (transition validation)
 *
 * @module lib/eva/eva-orchestrator
 */

import { randomUUID } from 'crypto';
import { VentureContextManager } from './venture-context-manager.js';
import { ChairmanPreferenceStore } from './chairman-preference-store.js';
import { evaluateDecision } from './decision-filter-engine.js';
import { evaluateRealityGate, isGatedBoundary } from './reality-gates.js';
import { attemptGateRecovery } from './gate-failure-recovery.js';
import { isDevilsAdvocateGate, getDevilsAdvocateReview, buildArtifactRecord } from './devils-advocate.js';
import { convertSprintToSDs, buildBridgeArtifactRecord } from './lifecycle-sd-bridge.js';
import { handlePostLifecycleDecision, isFinalStage } from './post-lifecycle-decisions.js';
import { createOrReusePendingDecision, waitForDecision, createAdvisoryNotification } from './chairman-decision-watcher.js';
import { OrchestratorTracer } from './observability.js';
import { VentureStateMachine } from '../agents/venture-state-machine.js';
import { validateStageGate } from '../agents/modules/venture-state-machine/stage-gates.js';
import { retrieveKnowledge } from './utils/knowledge-retriever.js';
import { getTemplate } from './stage-templates/index.js';
import { getContract, validatePreStage, validatePostStage } from './contracts/stage-contracts.js';
import { recordTokenUsage, checkBudget, buildTokenSummary } from './utils/token-tracker.js';
import { runRealityTracking } from './utils/assumption-reality-tracker.js';

// ── Status Constants ────────────────────────────────────────────

const STATUS = Object.freeze({
  COMPLETED: 'COMPLETED',
  BLOCKED: 'BLOCKED',
  FAILED: 'FAILED',
});

const FILTER_ACTION = Object.freeze({
  AUTO_PROCEED: 'AUTO_PROCEED',
  REQUIRE_REVIEW: 'REQUIRE_REVIEW',
  STOP: 'STOP',
});

// Filter Engine preference keys
const FILTER_PREFERENCE_KEYS = [
  'filter.cost_max_usd',
  'filter.min_score',
  'filter.approved_tech_list',
  'filter.approved_vendor_list',
  'filter.pivot_keywords',
];

// ── Public API ──────────────────────────────────────────────────

/**
 * Execute a single venture stage.
 *
 * @param {Object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {number} [params.stageId] - Stage to execute (resolved from state machine if omitted)
 * @param {Object} [params.options]
 * @param {boolean} [params.options.autoProceed=true] - Auto-advance on filter AUTO_PROCEED
 * @param {boolean} [params.options.dryRun=false] - Skip persistence and transitions
 * @param {string} [params.options.idempotencyKey] - Dedup key for artifact persistence
 * @param {string} [params.options.chairmanId] - Chairman ID for preference loading
 * @param {boolean} [params.options.enforceContracts=false] - Block on contract validation failures
 * @param {Object} [params.options.stageTemplate] - Override stage template (testing)
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger (defaults to console)
 * @param {Function} [deps.httpClient] - HTTP client for reality gates
 * @returns {Promise<Object>} Stage result
 */
export async function processStage({ ventureId, stageId, options = {} }, deps = {}) {
  const {
    supabase, logger = console, httpClient,
    evaluateDecisionFn = evaluateDecision,
    evaluateRealityGateFn = evaluateRealityGate,
    validateStageGateFn = validateStageGate,
  } = deps;
  const correlationId = randomUUID();
  const startedAt = new Date().toISOString();
  const autoProceed = options.autoProceed !== false;

  // ── Initialize tracer ──
  const tracer = new OrchestratorTracer({
    parentTraceId: options.parentTraceId,
    ventureId,
    logger,
  });
  tracer.emitEvent('stage_processing_started', { stageId, correlationId });

  if (!supabase) {
    tracer.emitEvent('stage_processing_failed', { reason: 'missing_dependency' });
    return buildResult({ ventureId, stageId, startedAt, correlationId, status: STATUS.FAILED, errors: [{ code: 'MISSING_DEPENDENCY', message: 'supabase client is required' }], traceId: tracer.traceId });
  }

  // ── Idempotency check ──
  if (options.idempotencyKey) {
    const existing = await checkIdempotency(supabase, ventureId, stageId, options.idempotencyKey);
    if (existing) {
      logger.log(`[Eva] Idempotent hit for key=${options.idempotencyKey}, returning cached result`);
      return existing;
    }
  }

  // ── 1. Load venture context ──
  let ventureContext;
  const ctxSpan = tracer.startSpan('context_load');
  try {
    const _ctxMgr = new VentureContextManager({ supabaseClient: supabase });
    const { data: venture, error } = await supabase
      .from('ventures')
      .select('id, name, status, current_lifecycle_stage, archetype, created_at')
      .eq('id', ventureId)
      .single();
    if (error || !venture) throw new Error(error?.message || 'Venture not found');
    ventureContext = venture;
    tracer.endSpan(ctxSpan.spanId, { status: 'completed' });
  } catch (err) {
    tracer.endSpan(ctxSpan.spanId, { status: 'failed', metadata: { error: err.message } });
    logger.error(`[Eva] Context load failed: ${err.message}`);
    tracer.emitEvent('stage_processing_failed', { reason: 'context_load_failed' });
    return buildResult({ ventureId, stageId, startedAt, correlationId, status: STATUS.FAILED, errors: [{ code: 'CONTEXT_LOAD_FAILED', message: err.message }], traceId: tracer.traceId });
  }

  // ── 2. Resolve stage ──
  const resolvedStage = stageId ?? ventureContext.current_lifecycle_stage ?? 1;
  logger.log(`[Eva] Processing stage ${resolvedStage} for venture ${ventureId} [${correlationId}]`);

  // ── 3. Load chairman preferences ──
  let preferences = {};
  const prefSpan = tracer.startSpan('preference_load');
  try {
    if (options.chairmanId) {
      const prefStore = new ChairmanPreferenceStore({ supabaseClient: supabase });
      const resolved = await prefStore.getPreferences({
        chairmanId: options.chairmanId,
        ventureId,
        keys: FILTER_PREFERENCE_KEYS,
      });
      for (const [key, pref] of resolved) {
        preferences[key] = pref.value;
      }
    }
    tracer.endSpan(prefSpan.spanId, { status: 'completed', metadata: { keyCount: Object.keys(preferences).length } });
  } catch (err) {
    tracer.endSpan(prefSpan.spanId, { status: 'failed', metadata: { error: err.message } });
    logger.warn(`[Eva] Preference loading failed (non-fatal): ${err.message}`);
  }

  // ── 3b. Cross-stage contract pre-validation ──
  const contract = getContract(resolvedStage);
  if (contract && contract.consumes.length > 0) {
    const preSpan = tracer.startSpan('contract_pre_validation');
    try {
      const upstreamMap = await loadUpstreamArtifacts(supabase, ventureId, contract.consumes.map(c => c.stage));
      const preResult = validatePreStage(resolvedStage, upstreamMap, { logger });
      const preStatus = preResult.valid ? 'completed' : (options.enforceContracts ? 'failed' : 'warning');
      tracer.endSpan(preSpan.spanId, { status: preStatus, metadata: { errors: preResult.errors.length, warnings: preResult.warnings.length } });

      if (!preResult.valid && options.enforceContracts) {
        logger.error(`[Eva][Contract] Pre-stage ${resolvedStage} BLOCKED: ${preResult.errors.join('; ')}`);
        return buildResult({ ventureId, stageId: resolvedStage, startedAt, correlationId, status: STATUS.BLOCKED, errors: preResult.errors.map(e => ({ code: 'CONTRACT_PRE_VALIDATION', message: e })), traceId: tracer.traceId });
      }
    } catch (err) {
      tracer.endSpan(preSpan.spanId, { status: 'failed', metadata: { error: err.message } });
      logger.warn(`[Eva][Contract] Pre-validation error (non-fatal): ${err.message}`);
    }
  }

  // ── 3c. Pre-stage budget check ──
  let budgetStatus = null;
  try {
    budgetStatus = await checkBudget(ventureId, { supabase, logger });
    if (budgetStatus?.is_over_budget) {
      logger.warn(`[Eva] Venture ${ventureId} is over token budget (${budgetStatus.usage_percentage}%)`);
    }
  } catch (err) {
    logger.warn(`[Eva] Budget check failed (non-fatal): ${err.message}`);
  }

  // ── 4. Load and execute stage template ──
  let artifacts = [];
  let stageOutput = {};
  const stageTokenUsages = [];
  const templateSpan = tracer.startSpan('template_execution');
  try {
    const template = options.stageTemplate || await loadStageTemplate(supabase, resolvedStage);
    const steps = template?.analysisSteps || [];

    // ── 4a. Run onBeforeAnalysis hook from JS stage template ──
    let hookContext = {};
    try {
      const jsTemplate = getTemplate(resolvedStage);
      if (jsTemplate?.onBeforeAnalysis) {
        const hookResult = await jsTemplate.onBeforeAnalysis({ ventureContext, supabase, logger });
        if (hookResult) {
          hookContext = hookResult;
          logger.log(`[Eva] onBeforeAnalysis hook executed for stage ${resolvedStage}`);
        }
      }
    } catch (hookErr) {
      logger.warn(`[Eva] onBeforeAnalysis hook failed (non-fatal): ${hookErr.message}`);
    }

    for (const step of steps) {
      try {
        const stepResult = typeof step.execute === 'function'
          ? await step.execute({ ventureContext, preferences, stage: resolvedStage, ...hookContext })
          : { artifactType: step.artifactType || 'generic', payload: {}, source: step.id || 'unknown' };

        // Track token usage from this step (fire-and-forget)
        if (stepResult.usage) {
          stageTokenUsages.push(stepResult.usage);
          recordTokenUsage({
            ventureId,
            stageId: resolvedStage,
            usage: stepResult.usage,
            metadata: {
              stepId: step.id,
              agentType: stepResult.agentType || 'claude',
              modelId: stepResult.modelId,
              operationType: step.artifactType || 'analysis',
            },
          }, { supabase, logger });
        }

        artifacts.push({
          artifactType: stepResult.artifactType || step.artifactType || 'stage_output',
          stageId: resolvedStage,
          createdAt: new Date().toISOString(),
          payload: stepResult.payload || stepResult,
          source: stepResult.source || step.id || 'template',
        });
      } catch (stepErr) {
        tracer.endSpan(templateSpan.spanId, { status: 'failed', metadata: { step: step.id, error: stepErr.message } });
        logger.error(`[Eva] Analysis step failed: ${step.id || 'unknown'}: ${stepErr.message}`);
        return buildResult({ ventureId, stageId: resolvedStage, startedAt, correlationId, status: STATUS.FAILED, artifacts, errors: [{ code: 'ANALYSIS_STEP_FAILED', step: step.id, message: stepErr.message }], traceId: tracer.traceId });
      }
    }

    stageOutput = mergeArtifactOutputs(artifacts, ventureContext);
    tracer.endSpan(templateSpan.spanId, { status: 'completed', metadata: { stepCount: steps.length, artifactCount: artifacts.length } });
  } catch (err) {
    tracer.endSpan(templateSpan.spanId, { status: 'failed', metadata: { error: err.message } });
    logger.error(`[Eva] Template execution failed: ${err.message}`);
    return buildResult({ ventureId, stageId: resolvedStage, startedAt, correlationId, status: STATUS.FAILED, artifacts, errors: [{ code: 'TEMPLATE_EXECUTION_FAILED', message: err.message }], traceId: tracer.traceId });
  }

  // ── 4b. Stage 25 completion guard ──
  // If this is the final lifecycle stage, delegate to post-lifecycle decision handler
  // instead of attempting to advance to a non-existent Stage 26.
  if (isFinalStage(resolvedStage)) {
    logger.log(`[Eva] Final stage ${resolvedStage} reached for venture ${ventureId} — invoking post-lifecycle handler`);

    // Persist artifacts before handing off
    if (!options.dryRun) {
      await persistArtifacts(supabase, ventureId, resolvedStage, artifacts, options.idempotencyKey);
    }

    const postLifecycleResult = await handlePostLifecycleDecision(
      { ventureId, ventureContext, stageOutput, artifacts, decision: options.postLifecycleDecision },
      { supabase, logger },
    );

    tracer.emitEvent('stage_processing_completed', {
      stageId: resolvedStage,
      correlationId,
      status: STATUS.COMPLETED,
      postLifecycle: true,
      decisionRequired: postLifecycleResult.requiresReview || false,
    });

    if (!options.dryRun && supabase) {
      await tracer.persistTrace(supabase).catch(() => {});
      await tracer.persistEvents(supabase).catch(() => {});
    }

    return buildResult({
      ventureId, stageId: resolvedStage, startedAt, correlationId,
      status: STATUS.COMPLETED, artifacts,
      nextStageId: null, // No next stage — lifecycle complete
      traceId: tracer.traceId,
      postLifecycleResult,
    });
  }

  // ── 4c. Cross-stage contract post-validation ──
  if (contract && contract.produces && Object.keys(contract.produces).length > 0) {
    const postSpan = tracer.startSpan('contract_post_validation');
    const postResult = validatePostStage(resolvedStage, stageOutput, { logger });
    const postStatus = postResult.valid ? 'completed' : (options.enforceContracts ? 'failed' : 'warning');
    tracer.endSpan(postSpan.spanId, { status: postStatus, metadata: { errors: postResult.errors.length } });

    if (!postResult.valid && options.enforceContracts) {
      logger.error(`[Eva][Contract] Post-stage ${resolvedStage} FAILED: ${postResult.errors.join('; ')}`);
      return buildResult({ ventureId, stageId: resolvedStage, startedAt, correlationId, status: STATUS.FAILED, artifacts, errors: postResult.errors.map(e => ({ code: 'CONTRACT_POST_VALIDATION', message: e })), traceId: tracer.traceId });
    }
  }

  // ── 5. Evaluate gates ──
  const nextStage = resolvedStage + 1;
  const gateResults = [];
  let gateBlocked = false;
  const gateSpan = tracer.startSpan('gate_evaluation');

  try {
    // Stage gates
    const stageGateResult = await validateStageGateFn(supabase, ventureId, resolvedStage, nextStage, {
      chairmanId: options.chairmanId,
      stageOutput,
      logger,
    });
    gateResults.push({ type: 'stage_gate', ...stageGateResult });
    if (!stageGateResult.passed) gateBlocked = true;

    // Reality gates
    const realityGateResult = await evaluateRealityGateFn(
      { from: resolvedStage, to: nextStage, ventureId },
      { supabase, httpClient, now: () => new Date() }
    );
    gateResults.push({ type: 'reality_gate', ...realityGateResult });
    if (!realityGateResult.passed && isGatedBoundary(resolvedStage, nextStage)) {
      // Attempt gate recovery before declaring blocked
      const rerunAnalysisFn = async (vid, stage, retryContext) => {
        return evaluateRealityGateFn(
          { from: stage, to: nextStage, ventureId: vid, _retryContext: retryContext },
          { supabase, httpClient, now: () => new Date() }
        );
      };
      const recovery = await attemptGateRecovery(
        { ventureId, fromStage: resolvedStage, toStage: nextStage, gateResult: realityGateResult, rerunAnalysisFn },
        { supabase, logger }
      );
      if (recovery.recovered && recovery.gateResult) {
        // Replace gate result with the successful retry
        gateResults[gateResults.length - 1] = { type: 'reality_gate', ...recovery.gateResult };
      } else {
        gateBlocked = true;
      }
    } else if (!realityGateResult.passed) {
      gateBlocked = true;
    }
  } catch (err) {
    logger.error(`[Eva] Gate evaluation error: ${err.message}`);
    gateResults.push({ type: 'error', passed: false, error: err.message });
    gateBlocked = true;
  }
  tracer.endSpan(gateSpan.spanId, { status: gateBlocked ? 'blocked' : 'completed', metadata: { gateCount: gateResults.length, blocked: gateBlocked } });

  // ── 5b. Devil's Advocate (model-isolated adversarial review) ──
  const { isGate: hasDAGate, gateType: daGateType } = isDevilsAdvocateGate(resolvedStage);
  let devilsAdvocateReview = null;
  if (hasDAGate) {
    try {
      const primaryGateResult = gateResults.find(g => g.type === 'stage_gate') || {};
      devilsAdvocateReview = await getDevilsAdvocateReview({
        stageId: resolvedStage,
        gateType: daGateType,
        gateResult: primaryGateResult,
        ventureContext,
        stageOutput,
      }, { logger });

      // Persist DA review as venture artifact
      if (!options.dryRun && supabase) {
        const artifactRow = buildArtifactRecord(ventureId, devilsAdvocateReview);
        const { error: daErr } = await supabase.from('venture_artifacts').insert(artifactRow);
        if (daErr) logger.warn(`[Eva] DA artifact persist failed: ${daErr.message}`);
      }

      gateResults.push({
        type: 'devils_advocate',
        passed: true, // DA is advisory, never blocks
        assessment: devilsAdvocateReview.overallAssessment,
        counterArguments: devilsAdvocateReview.counterArguments?.length || 0,
        isFallback: devilsAdvocateReview.isFallback || false,
      });
    } catch (err) {
      logger.warn(`[Eva] Devil's Advocate failed (non-fatal): ${err.message}`);
      gateResults.push({ type: 'devils_advocate', passed: true, error: err.message });
    }
  }

  if (gateBlocked) {
    // Persist artifacts even on gate failure
    if (!options.dryRun) {
      await persistArtifacts(supabase, ventureId, resolvedStage, artifacts, options.idempotencyKey);
    }
    return buildResult({
      ventureId, stageId: resolvedStage, startedAt, correlationId,
      status: STATUS.BLOCKED, artifacts, gateResults, devilsAdvocateReview,
      errors: gateResults.filter(g => !g.passed).map(g => ({
        code: g.type === 'stage_gate' ? 'STAGE_GATE_FAILED' : 'REALITY_GATE_FAILED',
        message: g.summary || g.error || 'Gate check failed',
      })),
    });
  }

  // ── 5c. Cross-Venture Knowledge Retrieval ──
  let knowledgeContext = [];
  const knowledgeSpan = tracer.startSpan('knowledge_retrieval');
  try {
    knowledgeContext = await retrieveKnowledge(
      { ventureContext, stageId: resolvedStage },
      { supabase, logger }
    );
    tracer.endSpan(knowledgeSpan.spanId, { status: 'completed', metadata: { itemCount: knowledgeContext.length } });
  } catch (err) {
    tracer.endSpan(knowledgeSpan.spanId, { status: 'failed', metadata: { error: err.message } });
    logger.warn(`[Eva] Knowledge retrieval failed (non-fatal): ${err.message}`);
  }

  // ── 6. Decision Filter Engine ──
  let filterDecision;
  const filterSpan = tracer.startSpan('filter_evaluation');
  try {
    // Refresh budget status after stage execution (cache may have been invalidated)
    if (stageTokenUsages.length > 0) {
      try {
        budgetStatus = await checkBudget(ventureId, { supabase, logger });
      } catch (_) { /* non-fatal */ }
    }

    const filterInput = {
      stage: String(resolvedStage),
      cost: stageOutput.cost,
      score: stageOutput.score,
      technologies: stageOutput.technologies || [],
      vendors: stageOutput.vendors || [],
      description: stageOutput.description || '',
      patterns: stageOutput.patterns || [],
      priorPatterns: [
        ...(stageOutput.priorPatterns || []),
        ...knowledgeContext.map(k => ({ source: k.source, content: k.content, score: k.score })),
      ],
      constraints: stageOutput.constraints || {},
      approvedConstraints: stageOutput.approvedConstraints || {},
      budgetStatus: budgetStatus || null,
    };

    const filterResult = evaluateDecisionFn(filterInput, { preferences, logger });

    // Map filter engine output to PRD-specified action enum
    let action;
    if (filterResult.auto_proceed) {
      action = FILTER_ACTION.AUTO_PROCEED;
    } else if (filterResult.triggers.some(t => t.severity === 'HIGH')) {
      action = FILTER_ACTION.STOP;
    } else {
      action = FILTER_ACTION.REQUIRE_REVIEW;
    }

    filterDecision = {
      action,
      reasons: filterResult.triggers.map(t => t.message),
      recommendation: filterResult.recommendation,
      raw: filterResult,
    };
  } catch (err) {
    logger.error(`[Eva] Filter engine error: ${err.message}`);
    filterDecision = { action: FILTER_ACTION.REQUIRE_REVIEW, reasons: [`Filter error: ${err.message}`] };
  }
  tracer.endSpan(filterSpan.spanId, { status: 'completed', metadata: { action: filterDecision.action } });

  // ── 7. Persist artifacts ──
  const persistSpan = tracer.startSpan('artifact_persistence');
  if (!options.dryRun) {
    try {
      const persistedIds = await persistArtifacts(supabase, ventureId, resolvedStage, artifacts, options.idempotencyKey);
      artifacts = artifacts.map((a, i) => ({ ...a, id: persistedIds[i] }));
      tracer.endSpan(persistSpan.spanId, { status: 'completed', metadata: { artifactCount: artifacts.length } });
    } catch (err) {
      tracer.endSpan(persistSpan.spanId, { status: 'failed', metadata: { error: err.message } });
      logger.error(`[Eva] Artifact persist failed: ${err.message}`);
      return buildResult({ ventureId, stageId: resolvedStage, startedAt, correlationId, status: STATUS.FAILED, artifacts, filterDecision, gateResults, errors: [{ code: 'ARTIFACT_PERSIST_FAILED', message: err.message }], traceId: tracer.traceId });
    }
  } else {
    tracer.endSpan(persistSpan.spanId, { status: 'skipped', metadata: { reason: 'dry_run' } });
  }

  // ── 7b. Lifecycle-to-SD Bridge (Stage 18 sprint → LEO SDs) ──
  if (resolvedStage === 18 && stageOutput.sd_bridge_payloads?.length > 0 && !options.dryRun) {
    try {
      const bridgeResult = await convertSprintToSDs(
        { stageOutput, ventureContext },
        { supabase, logger },
      );
      if (bridgeResult.created) {
        logger.log(`[Eva] Lifecycle-to-SD Bridge: Created orchestrator ${bridgeResult.orchestratorKey} with ${bridgeResult.childKeys.length} children`);
      }
      // Persist bridge result as artifact
      const bridgeArtifact = buildBridgeArtifactRecord(ventureId, resolvedStage, bridgeResult);
      const { error: bridgeErr } = await supabase.from('venture_artifacts').insert(bridgeArtifact);
      if (bridgeErr) logger.warn(`[Eva] Bridge artifact persist failed: ${bridgeErr.message}`);
    } catch (err) {
      logger.warn(`[Eva] Lifecycle-to-SD Bridge failed (non-fatal): ${err.message}`);
    }
  }

  // ── 7c. Assumptions vs Reality tracking (Stage >= 17) ──
  if (resolvedStage >= 17 && !options.dryRun) {
    try {
      const calibrationReport = await runRealityTracking(
        { ventureId, stageId: resolvedStage },
        { supabase, logger },
      );
      if (calibrationReport) {
        logger.log(`[Eva] Reality tracking: accuracy=${calibrationReport.aggregate_accuracy} for venture ${ventureId}`);
      }
    } catch (err) {
      logger.warn(`[Eva] Reality tracking failed (non-fatal): ${err.message}`);
    }
  }

  // ── 7d. Advisory checkpoint notifications (non-blocking) ──
  const ADVISORY_STAGES = [3, 5, 16, 23];
  if (ADVISORY_STAGES.includes(resolvedStage) && !options.dryRun) {
    try {
      await createAdvisoryNotification({
        ventureId,
        stageNumber: resolvedStage,
        briefData: stageOutput,
        summary: `Stage ${resolvedStage} advisory: ${stageOutput?.decision || 'analysis complete'}`,
        supabase,
        logger,
      });
    } catch (err) {
      logger.warn(`[Eva] Advisory notification failed (non-fatal): ${err.message}`);
    }
  }

  // ── 8. Advance stage (conditional) ──
  let nextStageId = null;
  if (filterDecision.action === FILTER_ACTION.AUTO_PROCEED && autoProceed && !options.dryRun) {
    try {
      const sm = new VentureStateMachine({ supabaseClient: supabase, ventureId });
      await sm.initialize();
      await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: nextStage })
        .eq('id', ventureId);
      nextStageId = nextStage;
      logger.log(`[Eva] Advanced venture ${ventureId} to stage ${nextStage}`);
    } catch (err) {
      logger.warn(`[Eva] Stage advance failed (non-fatal): ${err.message}`);
    }
  } else if (filterDecision.action === FILTER_ACTION.AUTO_PROCEED) {
    nextStageId = nextStage; // Suggested but not applied
  }

  // ── 9. Finalize trace ──
  tracer.emitEvent('stage_processing_completed', {
    stageId: resolvedStage,
    correlationId,
    status: STATUS.COMPLETED,
    nextStageId,
    totalDurationMs: Date.now() - new Date(startedAt).getTime(),
  });

  // Persist trace (non-fatal)
  if (!options.dryRun && supabase) {
    await tracer.persistTrace(supabase).catch(() => {});
    await tracer.persistEvents(supabase).catch(() => {});
  }

  // Build token usage summary for stage output
  const tokenUsageSummary = buildTokenSummary(stageTokenUsages, budgetStatus);

  return buildResult({
    ventureId, stageId: resolvedStage, startedAt, correlationId,
    status: STATUS.COMPLETED, artifacts, filterDecision, gateResults, nextStageId, devilsAdvocateReview,
    knowledgeContext,
    traceId: tracer.traceId, tokenUsageSummary,
  });
}

/**
 * Run the orchestration loop: repeatedly call processStage until a stop condition.
 *
 * @param {Object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {Object} [params.options]
 * @param {number} [params.options.maxStages=25] - Max stages to process
 * @param {boolean} [params.options.autoProceed=true]
 * @param {string} [params.options.chairmanId]
 * @param {Object} deps - Injected dependencies
 * @returns {Promise<Object[]>} Ordered array of stage results
 */
export async function run({ ventureId, options = {} }, deps = {}) {
  const { logger = console } = deps;
  const maxStages = options.maxStages || 25;
  const results = [];

  logger.log(`[Eva] Starting orchestration loop for venture ${ventureId} (max ${maxStages} stages)`);

  for (let i = 0; i < maxStages; i++) {
    const result = await processStage({ ventureId, options }, deps);
    results.push(result);

    if (result.status === STATUS.FAILED || result.status === STATUS.BLOCKED) {
      logger.log(`[Eva] Loop stopped: ${result.status} at stage ${result.stageId}`);
      break;
    }

    if (result.filterDecision?.action === FILTER_ACTION.STOP) {
      logger.log(`[Eva] Loop stopped: filter decision STOP at stage ${result.stageId}`);
      break;
    }

    if (result.filterDecision?.action === FILTER_ACTION.REQUIRE_REVIEW) {
      logger.log(`[Eva] Review required at stage ${result.stageId}`);

      // Create PENDING chairman decision for interactive review
      try {
        const { id: decisionId } = await createOrReusePendingDecision({
          ventureId,
          stageNumber: result.stageId,
          briefData: {
            reasons: result.filterDecision.reasons,
            recommendation: result.filterDecision.recommendation,
          },
          summary: `Review required: ${result.filterDecision.reasons?.[0] || 'filter trigger'}`,
          supabase: deps.supabase,
          logger,
        });
        logger.log(`[Eva] Chairman decision created: ${decisionId}`);
        logger.log(`[Eva] Approve/reject via: node scripts/eva-decisions.js approve ${decisionId} --rationale "reason"`);

        // If waitForReview option is set, block until decision is made
        if (options.waitForReview) {
          logger.log('[Eva] Waiting for chairman decision...');
          const resolution = await waitForDecision({
            decisionId,
            supabase: deps.supabase,
            logger,
            timeoutMs: options.reviewTimeoutMs || 0,
          });

          if (resolution.status === 'approved') {
            logger.log('[Eva] Decision approved, continuing loop');
            continue; // Resume loop at next stage
          }
          logger.log(`[Eva] Decision ${resolution.status}, stopping loop`);
        }
      } catch (err) {
        logger.warn(`[Eva] Chairman decision creation failed (non-fatal): ${err.message}`);
      }
      break;
    }

    if (!result.nextStageId) {
      logger.log(`[Eva] Loop complete: no next stage after ${result.stageId}`);
      break;
    }

    // Next iteration uses the new stage
    options = { ...options, idempotencyKey: undefined };
  }

  return results;
}

// ── Internal Helpers ────────────────────────────────────────────

function buildResult({ ventureId, stageId, startedAt, correlationId, status, artifacts = [], filterDecision = null, gateResults = [], nextStageId = null, errors = [], devilsAdvocateReview = null, knowledgeContext = [], traceId = null, tokenUsageSummary = null, postLifecycleResult = null }) {
  const result = {
    ventureId,
    stageId,
    startedAt,
    completedAt: new Date().toISOString(),
    correlationId,
    status,
    artifacts,
    filterDecision,
    gateResults,
    nextStageId,
    errors,
    devilsAdvocateReview,
    knowledgeContext,
    traceId,
    tokenUsageSummary,
  };
  if (postLifecycleResult) {
    result.postLifecycleResult = postLifecycleResult;
  }
  return result;
}

function mergeArtifactOutputs(artifacts, ventureContext) {
  const output = { description: ventureContext.name || '' };
  for (const art of artifacts) {
    if (art.payload) {
      if (art.payload.cost !== undefined) output.cost = art.payload.cost;
      if (art.payload.score !== undefined) output.score = art.payload.score;
      if (art.payload.technologies) output.technologies = art.payload.technologies;
      if (art.payload.vendors) output.vendors = art.payload.vendors;
      if (art.payload.patterns) output.patterns = art.payload.patterns;
    }
  }
  return output;
}

async function loadStageTemplate(supabase, stageId) {
  const { data } = await supabase
    .from('venture_stage_templates')
    .select('template_data')
    .eq('lifecycle_stage', stageId)
    .eq('is_active', true)
    .single();

  if (data?.template_data) return data.template_data;

  // Default minimal template
  return { stageId, version: '1.0.0', analysisSteps: [] };
}

async function persistArtifacts(supabase, ventureId, stageId, artifacts, idempotencyKey) {
  const ids = [];
  for (const art of artifacts) {
    const row = {
      venture_id: ventureId,
      lifecycle_stage: stageId,
      artifact_type: art.artifactType,
      artifact_data: art.payload,
      is_current: true,
      source: art.source || 'eva-orchestrator',
    };
    if (idempotencyKey) {
      row.idempotency_key = idempotencyKey;
    }

    // Four Buckets: populate epistemic columns when classification data is present
    const fb = art.payload?.fourBuckets;
    if (fb?.classifications?.length > 0) {
      // Dominant bucket = highest count in summary
      const s = fb.summary || {};
      const bucketCounts = [
        ['fact', s.facts || 0],
        ['assumption', s.assumptions || 0],
        ['simulation', s.simulations || 0],
        ['unknown', s.unknowns || 0],
      ];
      bucketCounts.sort((a, b) => b[1] - a[1]);
      row.epistemic_classification = bucketCounts[0][0];
      row.epistemic_evidence = fb.classifications;
    }

    let insertError;
    let data;
    const insertResult = await supabase
      .from('venture_artifacts')
      .insert(row)
      .select('id')
      .single();
    data = insertResult.data;
    insertError = insertResult.error;

    // Graceful degradation: if epistemic columns cause constraint violation, retry without them
    if (insertError && row.epistemic_classification) {
      delete row.epistemic_classification;
      delete row.epistemic_evidence;
      const retryResult = await supabase
        .from('venture_artifacts')
        .insert(row)
        .select('id')
        .single();
      data = retryResult.data;
      insertError = retryResult.error;
    }

    if (insertError) throw new Error(`Failed to persist artifact: ${insertError.message}`);
    ids.push(data.id);
  }
  return ids;
}

async function checkIdempotency(supabase, ventureId, stageId, idempotencyKey) {
  const { data } = await supabase
    .from('venture_artifacts')
    .select('id, artifact_type, artifact_data, lifecycle_stage, created_at')
    .eq('venture_id', ventureId)
    .eq('idempotency_key', idempotencyKey);

  if (data && data.length > 0) {
    return {
      ventureId,
      stageId: stageId || data[0].lifecycle_stage,
      startedAt: data[0].created_at,
      completedAt: data[0].created_at,
      status: STATUS.COMPLETED,
      artifacts: data.map(d => ({
        id: d.id,
        artifactType: d.artifact_type,
        stageId: d.lifecycle_stage,
        createdAt: d.created_at,
        payload: d.artifact_data,
        source: 'cached',
      })),
      filterDecision: null,
      gateResults: [],
      nextStageId: null,
      errors: [],
    };
  }
  return null;
}

/**
 * Load upstream stage artifacts for contract validation.
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {number[]} stageNumbers - Stage numbers to load
 * @returns {Promise<Map<number, Object>>} Map of stage number → artifact payload
 */
async function loadUpstreamArtifacts(supabase, ventureId, stageNumbers) {
  const map = new Map();
  if (stageNumbers.length === 0) return map;

  const { data } = await supabase
    .from('venture_artifacts')
    .select('lifecycle_stage, artifact_data')
    .eq('venture_id', ventureId)
    .eq('is_current', true)
    .in('lifecycle_stage', stageNumbers)
    .order('created_at', { ascending: false });

  for (const row of (data || [])) {
    // Keep only the most recent artifact per stage
    if (!map.has(row.lifecycle_stage)) {
      map.set(row.lifecycle_stage, row.artifact_data || {});
    }
  }
  return map;
}

// ── Exported for testing ────────────────────────────────────────

export const _internal = {
  buildResult,
  mergeArtifactOutputs,
  loadStageTemplate,
  persistArtifacts,
  checkIdempotency,
  loadUpstreamArtifacts,
  STATUS,
  FILTER_ACTION,
};
