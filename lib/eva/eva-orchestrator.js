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
// convertSprintToSDs + buildBridgeArtifactRecord moved to post-approval hook in stage-execution-worker.js
import { writeArtifact, recordGateResult, advanceStage } from './artifact-persistence-service.js';
import { ARTIFACT_TYPE_BY_STAGE } from './artifact-types.js';
import { extractAndPersistADRs } from './adr-extractor.js';
import { handlePostLifecycleDecision, isFinalStage } from './post-lifecycle-decisions.js';
import { createOrReusePendingDecision, waitForDecision, createAdvisoryNotification } from './chairman-decision-watcher.js';
import { OrchestratorTracer } from './observability.js';
import { autonomyPreCheck } from './autonomy-model.js';
import { VentureStateMachine } from '../agents/venture-state-machine.js';
import { validateStageGate } from '../agents/modules/venture-state-machine/stage-gates.js';
import { retrieveKnowledge } from './utils/knowledge-retriever.js';
import { getTemplate } from './stage-templates/index.js';
import { getContract, validatePreStage, validatePostStage, CONTRACT_ENFORCEMENT } from './contracts/stage-contracts.js';
import { recordTokenUsage, checkBudget, buildTokenSummary } from './utils/token-tracker.js';
import { runRealityTracking } from './utils/assumption-reality-tracker.js';
import { scoreTasteGate, buildTasteSummary, TASTE_VERDICT } from './taste-gate-scorer.js';
import { checkDependencies } from './dependency-manager.js';
import { emit } from './shared-services.js';
import {
  STATUS,
  FILTER_ACTION,
  ANALYSIS_DEPTH,
  selectAnalysisDepth,
  buildResult,
  mergeArtifactOutputs,
  loadStageTemplate,
  persistArtifacts,
  checkIdempotency,
  loadUpstreamArtifacts,
  extractMultiArtifacts,
} from './eva-orchestrator-helpers.js';

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

  // ── Derive contract enforcement mode (SD-MAN-INFRA-STAGE-DATA-FLOW-001: FR-002) ──
  const enforcementMode = options.enforceContracts
    ? CONTRACT_ENFORCEMENT.BLOCKING
    : (process.env.EVA_CONTRACT_ENFORCEMENT_MODE === 'advisory'
      ? CONTRACT_ENFORCEMENT.ADVISORY
      : CONTRACT_ENFORCEMENT.BLOCKING);

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

    // Resolve eva_ventures.id for event tracing (eva_events FK references eva_ventures)
    try {
      const { data: evaVenture } = await supabase
        .from('eva_ventures')
        .select('id')
        .eq('venture_id', ventureId)
        .single();
      if (evaVenture) {
        tracer.ventureId = evaVenture.id;
      }
    } catch {
      // Graceful: tracer keeps original ventureId (may cause FK warning but won't crash)
      logger.warn(`[Eva] Could not resolve eva_ventures.id for venture ${ventureId}`);
    }

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

  // ── 2a. Resolve vision_key and plan_key for EVA governance ──
  let visionKey = null;
  let planKey = null;
  try {
    const ventureName = (ventureContext.name || '').replace(/[^A-Za-z0-9-]/g, '-').toUpperCase();

    if (resolvedStage === 1) {
      // Stage 1: Generate and seed vision record
      visionKey = `VISION-${ventureName}-L2-001`;
      const { data: existing } = await supabase
        .from('eva_vision_documents')
        .select('vision_key')
        .eq('vision_key', visionKey)
        .maybeSingle();
      if (!existing) {
        await supabase.from('eva_vision_documents').insert({
          vision_key: visionKey,
          level: 'L2',
          venture_id: ventureId,
          status: 'draft',
          content: { seeded_at_stage: 1, venture_name: ventureContext.name },
          version: 1,
        });
        logger.log(`[Eva] Seeded vision record: ${visionKey} (draft)`);
      }
    } else {
      // Stages 2+: Resolve existing vision_key
      const { data: visionDoc } = await supabase
        .from('eva_vision_documents')
        .select('vision_key')
        .eq('venture_id', ventureId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (visionDoc) visionKey = visionDoc.vision_key;
    }

    if (resolvedStage === 13) {
      // Stage 13: Generate and seed architecture plan record
      planKey = `ARCH-${ventureName}-001`;
      const { data: existing } = await supabase
        .from('eva_architecture_plans')
        .select('plan_key')
        .eq('plan_key', planKey)
        .maybeSingle();
      if (!existing) {
        await supabase.from('eva_architecture_plans').insert({
          plan_key: planKey,
          venture_id: ventureId,
          vision_id: visionKey,
          content: { seeded_at_stage: 13, venture_name: ventureContext.name },
          version: 1,
        });
        logger.log(`[Eva] Seeded architecture plan: ${planKey}`);
      }
    } else if (resolvedStage > 13) {
      // Stages 14+: Resolve existing plan_key
      const { data: archDoc } = await supabase
        .from('eva_architecture_plans')
        .select('plan_key')
        .eq('venture_id', ventureId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (archDoc) planKey = archDoc.plan_key;
    }

    if (visionKey || planKey) {
      logger.log(`[Eva] EVA keys resolved: vision=${visionKey || 'none'}, plan=${planKey || 'none'}`);
    }
  } catch (evaKeyErr) {
    logger.warn(`[Eva] EVA key resolution failed (non-fatal): ${evaKeyErr.message}`);
  }

  // ── 2c. Load required artifact types from stage_artifact_requirements ──
  // SD-ARTIFACT-SYSTEM-RECONCILIATION-MULTIARTIFACT-ORCH-001-B: migrated from
  // lifecycle_stage_config.required_artifacts to stage_artifact_requirements table
  // (single source of truth, seeded by SD-UNIFIED-STAGE-GATE-ARTIFACTPRECONDITION-ORCH-001)
  let requiredArtifacts = [];
  try {
    const { data: artReqs } = await supabase
      .from('stage_artifact_requirements')
      .select('artifact_type')
      .eq('lifecycle_stage', resolvedStage); // QF-20260420-405: was 'stage_number' (wrong column)
    if (artReqs?.length > 0) {
      requiredArtifacts = artReqs.map(r => r.artifact_type);
      logger.log(`[Eva] Stage ${resolvedStage} requires artifacts: ${requiredArtifacts.join(', ')}`);
    }
  } catch {
    // Non-fatal: unconfigured stages fall back to stage_output
  }

  // ── 2b. Dependency check ──
  const depSpan = tracer.startSpan('dependency_check');
  try {
    const unresolvedDeps = await checkDependencies(supabase, ventureId, resolvedStage);
    const hardBlocks = unresolvedDeps.filter(d => d.blocking);
    const softWarnings = unresolvedDeps.filter(d => !d.blocking);

    if (hardBlocks.length > 0) {
      tracer.endSpan(depSpan.spanId, { status: 'blocked', metadata: { hardBlocks: hardBlocks.length } });
      logger.warn(`[Eva] Stage ${resolvedStage} BLOCKED by ${hardBlocks.length} hard dependency(ies) for venture ${ventureId}`);
      await emit(supabase, 'dependency_blocked', {
        ventureId,
        stage: resolvedStage,
        hardBlocks: hardBlocks.map(d => ({ id: d.id, providerId: d.providerId, requiredStage: d.requiredStage })),
      }, 'eva-orchestrator').catch(() => {});
      return buildResult({ ventureId, stageId: resolvedStage, startedAt, correlationId, status: STATUS.BLOCKED, errors: hardBlocks.map(d => ({ code: 'DEPENDENCY_BLOCKED', message: `Hard dependency on venture ${d.providerId} (stage ${d.requiredStage}) is unresolved` })), traceId: tracer.traceId });
    }

    if (softWarnings.length > 0) {
      logger.log(`[Eva] Stage ${resolvedStage} has ${softWarnings.length} soft dependency warning(s) — proceeding`);
      for (const dep of softWarnings) {
        createAdvisoryNotification({
          ventureId,
          stageNumber: resolvedStage,
          summary: `Soft dependency on venture ${dep.providerId} (stage ${dep.requiredStage}) is unresolved`,
          briefData: { type: 'soft_dependency', dependencyId: dep.id, providerId: dep.providerId },
          supabase,
        }).catch(() => {});
      }
    }

    tracer.endSpan(depSpan.spanId, { status: 'completed', metadata: { hardBlocks: 0, softWarnings: softWarnings.length } });
    await emit(supabase, 'dependency_check_passed', {
      ventureId,
      stage: resolvedStage,
      softWarnings: softWarnings.length,
    }, 'eva-orchestrator').catch(() => {});
  } catch (depErr) {
    tracer.endSpan(depSpan.spanId, { status: 'failed', metadata: { error: depErr.message } });
    logger.error(`[Eva] Dependency check failed: ${depErr.message}`);
    return buildResult({ ventureId, stageId: resolvedStage, startedAt, correlationId, status: STATUS.FAILED, errors: [{ code: 'DEPENDENCY_CHECK_FAILED', message: depErr.message }], traceId: tracer.traceId });
  }

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

  // ── 3b. Cross-stage contract pre-validation (advisory, not blocking) ──
  let contractPreErrors = [];
  const contract = getContract(resolvedStage);
  if (contract && contract.consumes.length > 0) {
    const preSpan = tracer.startSpan('contract_pre_validation');
    try {
      const upstreamMap = await loadUpstreamArtifacts(supabase, ventureId, contract.consumes.map(c => c.stage));
      const preResult = validatePreStage(resolvedStage, upstreamMap, { logger, enforcement: enforcementMode });
      const preStatus = preResult.valid ? 'completed' : (preResult.blocked ? 'failed' : 'warning');
      tracer.endSpan(preSpan.spanId, { status: preStatus, metadata: { errors: preResult.errors.length, warnings: preResult.warnings.length } });

      if (!preResult.valid && preResult.blocked) {
        // SD-LEO-INFRA-EVA-ANALYSIS-FIRST-001: Contract pre-validation failures are now
        // advisory, not blocking. Analysis always runs so artifacts are produced even when
        // upstream data is incomplete. The worker's contract-block guard (line 902 in
        // stage-execution-worker.js) provides defense-in-depth if needed.
        logger.warn(`[Eva][Contract] Pre-stage ${resolvedStage} validation: ${preResult.errors.length} error(s) [advisory] { errors: ${JSON.stringify(preResult.errors)} }`);
        // Store errors for downstream visibility but don't block
        contractPreErrors = preResult.errors.map(e => ({ code: 'CONTRACT_PRE_VALIDATION', message: e }));
      }
    } catch (err) {
      tracer.endSpan(preSpan.spanId, { status: 'failed', metadata: { error: err.message } });
      logger.warn(`[Eva][Contract] Pre-validation error (non-fatal): ${err.message}`);
    }
  }

  // ── 3c. Pre-stage budget check & depth selection ──
  let budgetStatus = null;
  let analysisDepth = ANALYSIS_DEPTH.STANDARD;
  try {
    budgetStatus = await checkBudget(ventureId, { supabase, logger });
    if (budgetStatus?.is_over_budget) {
      logger.warn(`[Eva] Venture ${ventureId} is over token budget (${budgetStatus.usage_percentage}%)`);
    }
    // Select analysis depth based on remaining budget
    analysisDepth = selectAnalysisDepth(budgetStatus);
    if (analysisDepth !== ANALYSIS_DEPTH.DEEP) {
      logger.log(`[Eva] Analysis depth: ${analysisDepth} (budget remaining: ${budgetStatus ? Math.max(0, 100 - budgetStatus.usage_percentage) : '?'}%)`);
    }
  } catch (err) {
    logger.warn(`[Eva] Budget check failed (non-fatal): ${err.message}`);
  }

  // ── 4. Load and execute stage template ──
  let artifacts = [];
  let stageOutput = {};
  const stageTokenUsages = [];
  let hookContext = { visionKey, planKey };
  const templateSpan = tracer.startSpan('template_execution');
  try {
    const template = options.stageTemplate || await loadStageTemplate(supabase, resolvedStage);
    const steps = template?.analysisSteps || [];

    // ── 4a. Run onBeforeAnalysis hook from JS stage template ──
    try {
      const jsTemplate = getTemplate(resolvedStage);
      if (jsTemplate?.onBeforeAnalysis) {
        const hookResult = await jsTemplate.onBeforeAnalysis(supabase, ventureContext?.id || ventureId);
        if (hookResult) {
          hookContext = hookResult;
          logger.log(`[Eva] onBeforeAnalysis hook executed for stage ${resolvedStage}`);
        }
      }
    } catch (hookErr) {
      logger.warn(`[Eva] onBeforeAnalysis hook failed (non-fatal): ${hookErr.message}`);
    }

    // Step-result contract — TWO supported forms (SD-LEO-INFRA-STAGE-PER-TYPE-001):
    //   1. Legacy single-artifact: `{ artifactType, payload, source, usage? }`.
    //      One artifact pushed per step. Multi-artifact splitting (if required)
    //      is done downstream by extractMultiArtifacts (block below).
    //   2. Typed-array form: `{ artifacts: [{ artifactType, payload, source, gaps? }, ...], usage? }`
    //      where `artifacts` is a non-empty array. Each entry is pushed directly
    //      and the `extractMultiArtifacts` fallback is BYPASSED for this step.
    //      Detection rule: `Array.isArray(stepResult.artifacts) && stepResult.artifacts.length > 0`.
    //      Both conditions MUST hold; non-array `stepResult` (or empty array) takes
    //      the legacy path so existing stages 13/15/16/etc. continue unchanged.
    let stepProvidedTypedArtifacts = false;
    for (const step of steps) {
      try {
        const stepResult = typeof step.execute === 'function'
          ? await step.execute({ ventureContext, preferences, stage: resolvedStage, analysisDepth, budgetStatus, ...hookContext })
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

        if (Array.isArray(stepResult.artifacts) && stepResult.artifacts.length > 0) {
          stepProvidedTypedArtifacts = true;
          for (const a of stepResult.artifacts) {
            artifacts.push({
              artifactType: a.artifactType,
              stageId: resolvedStage,
              createdAt: new Date().toISOString(),
              payload: a.payload,
              source: a.source || step.id || 'template',
              ...(a.gaps ? { gaps: a.gaps } : {}),
            });
          }
        } else {
          artifacts.push({
            artifactType: stepResult.artifactType || step.artifactType || requiredArtifacts[0] || (ARTIFACT_TYPE_BY_STAGE[resolvedStage]?.[0]) || (() => { throw new Error(`No artifact type configured for stage ${resolvedStage} — check stage_artifact_requirements and ARTIFACT_TYPE_BY_STAGE`); })(),
            stageId: resolvedStage,
            createdAt: new Date().toISOString(),
            payload: stepResult.payload || stepResult,
            source: stepResult.source || step.id || 'template',
          });
        }
      } catch (stepErr) {
        tracer.endSpan(templateSpan.spanId, { status: 'failed', metadata: { step: step.id, error: stepErr.message } });
        logger.error(`[Eva] Analysis step failed: ${step.id || 'unknown'}: ${stepErr.message}`);
        return buildResult({ ventureId, stageId: resolvedStage, startedAt, correlationId, status: STATUS.FAILED, artifacts, errors: [{ code: 'ANALYSIS_STEP_FAILED', step: step.id, message: stepErr.message }], traceId: tracer.traceId });
      }
    }

    stageOutput = mergeArtifactOutputs(artifacts, ventureContext);

    // ── 4a.1. Multi-artifact extraction ──
    // For stages with multiple required_artifacts, split the merged output
    // by ## headings and create one artifact per required type.
    //
    // ANTI-PATTERN FIX: Previously, if extraction couldn't split by headings
    // (common when stage output is structured JSON, not markdown), this
    // fallback REPLICATED the same payload to all required types — producing
    // byte-identical rows that looked like distinct artifacts but contained
    // the same data. Example: Stage 14 wrote identical 11KB payloads to
    // blueprint_data_model, blueprint_erd_diagram, blueprint_api_contract,
    // and blueprint_schema_spec, all containing architecture layers.
    //
    // The fix: when extraction cannot produce per-type projections, keep the
    // single legitimate artifact (first in the required list) and log a loud
    // warning. Reality gates downstream will accurately detect missing types
    // instead of passing on duplicated garbage data.
    if (!stepProvidedTypedArtifacts && requiredArtifacts.length > 1) {
      try {
        // SD-ARTIFACT-ORCH-001-A: Query existing artifacts for dedup
        const { data: existingRows } = await supabase
          .from('venture_artifacts')
          .select('artifact_type')
          .eq('venture_id', ventureId)
          .eq('lifecycle_stage', resolvedStage); // QF-20260420-405: was 'stage_number' (wrong column)
        const existingTypes = (existingRows || []).map(r => r.artifact_type);

        const extracted = extractMultiArtifacts(stageOutput, requiredArtifacts, resolvedStage, existingTypes);
        if (extracted.length + existingTypes.length >= requiredArtifacts.length) {
          artifacts = extracted;
          logger.log(`[Eva] Multi-artifact extraction: ${extracted.length} artifacts for stage ${resolvedStage}`);
        } else {
          // Extraction could not split the output (structured JSON or missing headings).
          // Do NOT replicate — keep only the single legitimate artifact and warn.
          // The first required type receives the full payload; other types are
          // intentionally NOT written so reality gates can detect the gap honestly.
          const primaryType = requiredArtifacts[0];
          const missingTypes = requiredArtifacts.slice(1);
          logger.warn(
            `[Eva] Stage ${resolvedStage} multi-artifact extraction incomplete ` +
            `(${extracted.length}/${requiredArtifacts.length}). Keeping only '${primaryType}' ` +
            `to avoid replicating the same payload to ${missingTypes.length} other type(s): ` +
            `${missingTypes.join(', ')}. Implement per-type projection in the stage analysis step ` +
            'to write distinct artifacts for each required type.'
          );
          // Reassign the single artifact to the primary type (in case step used a different type)
          if (artifacts.length > 0) {
            artifacts[0].artifactType = primaryType;
          }
        }
      } catch (extractErr) {
        logger.warn(`[Eva] Multi-artifact extraction failed: ${extractErr.message}, falling back to single artifact`);
      }
    }

    tracer.endSpan(templateSpan.spanId, { status: 'completed', metadata: { stepCount: steps.length, artifactCount: artifacts.length } });
  } catch (err) {
    tracer.endSpan(templateSpan.spanId, { status: 'failed', metadata: { error: err.message } });
    logger.error(`[Eva] Template execution failed: ${err.message}`);
    return buildResult({ ventureId, stageId: resolvedStage, startedAt, correlationId, status: STATUS.FAILED, artifacts, errors: [{ code: 'TEMPLATE_EXECUTION_FAILED', message: err.message }], traceId: tracer.traceId });
  }

  // ── 4a.2. Resolve chairman gate from onBeforeAnalysis (autonomy-aware) ──
  if (hookContext.chairmanDecisionId && stageOutput) {
    const autonomy = await autonomyPreCheck(ventureId, 'stage_gate', { supabase, chairmanPreferenceStore: deps.chairmanPreferenceStore }).catch(() => ({ action: 'manual' }));
    if (autonomy.action === 'auto_approve') {
      await supabase.from('chairman_decisions')
        .update({ status: 'approved', decision: 'proceed', rationale: `Auto-approved (${autonomy.level} autonomy)` })
        .eq('id', hookContext.chairmanDecisionId)
        .eq('status', 'pending');
      stageOutput.chairmanGate = {
        status: 'approved',
        rationale: `Auto-approved (${autonomy.level} autonomy)`,
        decision_id: hookContext.chairmanDecisionId,
      };
      // Also patch into artifact payloads
      for (const art of artifacts) {
        if (art.payload && typeof art.payload === 'object') {
          art.payload.chairmanGate = stageOutput.chairmanGate;
        }
      }
      logger.log(`   Chairman gate auto-approved (${autonomy.level})`);
    } else {
      try {
        // CronPulse RCA #6: Single DB check instead of 5s polling (reduces noisy timeouts)
        const decisionResult = await waitForDecision({
          decisionId: hookContext.chairmanDecisionId,
          supabase,
          logger,
          timeoutMs: 1000,
          maxAttempts: 1,
        });
        stageOutput.chairmanGate = {
          status: decisionResult.status,
          rationale: decisionResult.rationale,
          decision_id: hookContext.chairmanDecisionId,
        };
        for (const art of artifacts) {
          if (art.payload && typeof art.payload === 'object') {
            art.payload.chairmanGate = stageOutput.chairmanGate;
          }
        }
      } catch (err) {
        logger.warn(`   Chairman gate resolution failed: ${err.message}`);
        stageOutput.chairmanGate = { status: 'pending', decision_id: hookContext.chairmanDecisionId };
      }
    }
  }

  // ── 4b. Stage 25 completion guard ──
  // If this is the final lifecycle stage, delegate to post-lifecycle decision handler
  // instead of attempting to advance to a non-existent Stage 26.
  if (isFinalStage(resolvedStage)) {
    logger.log(`[Eva] Final stage ${resolvedStage} reached for venture ${ventureId} — invoking post-lifecycle handler`);

    // Persist artifacts before handing off
    if (!options.dryRun) {
      await persistArtifacts(supabase, ventureId, resolvedStage, artifacts, options.idempotencyKey, { visionKey, planKey });
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
    const postResult = validatePostStage(resolvedStage, stageOutput, { logger, enforcement: enforcementMode });
    const postStatus = postResult.valid ? 'completed' : (postResult.blocked ? 'failed' : 'warning');
    tracer.endSpan(postSpan.spanId, { status: postStatus, metadata: { errors: postResult.errors.length } });

    if (!postResult.valid && postResult.blocked) {
      // SD-LEO-INFRA-EVA-ANALYSIS-FIRST-001: Post-validation advisory, not blocking.
      // Artifacts are already produced — blocking here loses them. Log and continue.
      logger.warn(`[Eva][Contract] Post-stage ${resolvedStage} validation: ${postResult.errors.length} error(s) [advisory] { errors: ${JSON.stringify(postResult.errors)} }`);
    }
  }

  // ── 4d. Persist artifacts (before gate evaluation so reality gates can query DB) ──
  const earlyPersistSpan = tracer.startSpan('artifact_persistence_early');
  if (!options.dryRun) {
    try {
      const persistedIds = await persistArtifacts(supabase, ventureId, resolvedStage, artifacts, options.idempotencyKey, { visionKey, planKey });
      artifacts = artifacts.map((a, i) => ({ ...a, id: persistedIds[i] }));
      tracer.endSpan(earlyPersistSpan.spanId, { status: 'completed', metadata: { artifactCount: artifacts.length } });
    } catch (err) {
      tracer.endSpan(earlyPersistSpan.spanId, { status: 'failed', metadata: { error: err.message } });
      logger.error(`[Eva] Artifact persist failed: ${err.message}`);
      return buildResult({ ventureId, stageId: resolvedStage, startedAt, correlationId, status: STATUS.FAILED, artifacts, errors: [{ code: 'ARTIFACT_PERSIST_FAILED', message: err.message }], traceId: tracer.traceId });
    }
  } else {
    tracer.endSpan(earlyPersistSpan.spanId, { status: 'skipped', metadata: { reason: 'dry_run' } });
  }

  // ── 4e. Stage 14 ADR extraction (post-artifact persistence) ──
  if (resolvedStage === 14 && !options.dryRun && supabase) {
    try {
      const adrResult = await extractAndPersistADRs(supabase, ventureId, stageOutput, { logger });
      if (adrResult.adrCount > 0) {
        logger.log(`[Eva] Stage 14 ADR extraction: ${adrResult.adrCount} ADRs persisted`);
      }
    } catch (adrErr) {
      // Non-blocking — ADR extraction failure should not stop the pipeline
      logger.warn(`[Eva] Stage 14 ADR extraction failed (non-blocking): ${adrErr.message}`);
    }
  }

  // ── 5. Evaluate gates (autonomy-aware) ──
  const nextStage = resolvedStage + 1;
  const gateResults = [];
  let gateBlocked = false;
  const gateSpan = tracer.startSpan('gate_evaluation');

  try {
    // Autonomy pre-check for stage gates
    const stageAutonomy = await autonomyPreCheck(ventureId, 'stage_gate', { supabase, chairmanPreferenceStore: deps.chairmanPreferenceStore });
    gateResults.push({ type: 'autonomy_check', gateType: 'stage_gate', passed: true, ...stageAutonomy });

    let stageGateResult;
    if (stageAutonomy.action === 'auto_approve') {
      stageGateResult = { passed: true, summary: `Auto-approved at ${stageAutonomy.level}`, autonomyAction: 'auto_approve' };
    } else if (stageAutonomy.action === 'skip') {
      stageGateResult = { passed: true, summary: `Skipped at ${stageAutonomy.level}`, autonomyAction: 'skip' };
    } else {
      // L0 manual — run gate as before
      stageGateResult = await validateStageGateFn(supabase, ventureId, resolvedStage, nextStage, {
        chairmanId: options.chairmanId,
        stageOutput,
        logger,
      });
    }
    gateResults.push({ type: 'stage_gate', ...stageGateResult });
    if (!stageGateResult.passed) gateBlocked = true;

    // Autonomy pre-check for reality gates
    const realityAutonomy = await autonomyPreCheck(ventureId, 'reality_gate', { supabase, chairmanPreferenceStore: deps.chairmanPreferenceStore });
    gateResults.push({ type: 'autonomy_check', gateType: 'reality_gate', passed: true, ...realityAutonomy });

    let realityGateResult;
    if (realityAutonomy.action === 'auto_approve') {
      realityGateResult = { passed: true, summary: `Auto-approved at ${realityAutonomy.level}`, autonomyAction: 'auto_approve' };
    } else if (realityAutonomy.action === 'skip') {
      realityGateResult = { passed: true, summary: `Skipped at ${realityAutonomy.level}`, autonomyAction: 'skip' };
    } else {
      // L0 manual — run gate as before
      realityGateResult = await evaluateRealityGateFn(
        { from: resolvedStage, to: nextStage, ventureId, requiredArtifacts },
        { supabase, httpClient, now: () => new Date() }
      );
    }
    gateResults.push({ type: 'reality_gate', ...realityGateResult });
    if (!realityGateResult.passed && isGatedBoundary(resolvedStage, nextStage, requiredArtifacts)) {
      // Attempt gate recovery before declaring blocked
      const rerunAnalysisFn = async (vid, stage, retryContext) => {
        return evaluateRealityGateFn(
          { from: stage, to: nextStage, ventureId: vid, requiredArtifacts, _retryContext: retryContext },
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

  // ── 5a. Persist gate results to eva_stage_gate_results via Unified Persistence Service ──
  if (!options.dryRun && supabase) {
    for (const gr of gateResults.filter(g => g.type !== 'autonomy_check' && g.type !== 'error')) {
      try {
        await recordGateResult(supabase, {
          ventureId,
          stageNumber: resolvedStage,
          gateType: gr.type,
          passed: gr.passed,
          score: gr.score ?? null,
          reasoning: gr.summary || gr.error || null,
          metadata: { correlationId, autonomyAction: gr.autonomyAction || null },
        });
      } catch (grErr) {
        logger.warn(`[Eva] Gate result persist failed for ${gr.type}: ${grErr.message}`);
      }
    }
  }

  // ── 5b. Devil's Advocate (autonomy-aware adversarial review) ──
  const { isGate: hasDAGate, gateType: daGateType } = isDevilsAdvocateGate(resolvedStage);
  let devilsAdvocateReview = null;
  if (hasDAGate) {
    // Autonomy pre-check for devil's advocate
    const daAutonomy = await autonomyPreCheck(ventureId, 'devils_advocate', { supabase, chairmanPreferenceStore: deps.chairmanPreferenceStore });
    if (daAutonomy.action === 'skip') {
      gateResults.push({ type: 'devils_advocate', passed: true, summary: `Skipped at ${daAutonomy.level}`, autonomyAction: 'skip' });
    } else if (daAutonomy.action === 'auto_approve') {
      gateResults.push({ type: 'devils_advocate', passed: true, summary: `Auto-approved at ${daAutonomy.level}`, autonomyAction: 'auto_approve' });
    } else {
    try {
      const primaryGateResult = gateResults.find(g => g.type === 'stage_gate') || {};
      devilsAdvocateReview = await getDevilsAdvocateReview({
        stageId: resolvedStage,
        gateType: daGateType,
        gateResult: primaryGateResult,
        ventureContext,
        stageOutput,
      }, { logger });

      // Persist DA review as venture artifact via unified service
      if (!options.dryRun && supabase) {
        try {
          const artifactRow = buildArtifactRecord(ventureId, devilsAdvocateReview);
          await writeArtifact(supabase, {
            ventureId,
            lifecycleStage: artifactRow.lifecycle_stage,
            artifactType: artifactRow.artifact_type,
            title: artifactRow.title,
            content: artifactRow.content,
            metadata: artifactRow.metadata,
            source: artifactRow.source || 'devils-advocate',
            qualityScore: artifactRow.quality_score ?? 70,
            validationStatus: artifactRow.validation_status || 'validated',
            visionKey,
            planKey,
          });
        } catch (daErr) {
          logger.warn(`[Eva] DA artifact persist failed: ${daErr.message}`);
        }
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
    } // close autonomy else (manual DA)
  }

  if (gateBlocked) {
    // Archive vision record on kill at stages 3 or 5
    if ((resolvedStage === 3 || resolvedStage === 5) && visionKey && !options.dryRun) {
      try {
        await supabase.from('eva_vision_documents')
          .update({ status: 'archived', updated_at: new Date().toISOString() })
          .eq('vision_key', visionKey);
        logger.log(`[Eva] Vision ${visionKey} archived (killed at stage ${resolvedStage})`);
      } catch (archErr) {
        logger.warn(`[Eva] Vision archive failed (non-fatal): ${archErr.message}`);
      }
    }
    // Artifacts already persisted in step 4d (before gate evaluation)
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

  // ── 7. Artifacts already persisted in step 4d (before gate evaluation) ──

  // ── 7b. Lifecycle-to-SD Bridge ──
  // SD conversion now handled by post-approval hook in stage-execution-worker.js (Stage 18).
  // This ensures convertSprintToSDs() only fires after chairman hard gate approval,
  // not during stage execution. See SD-LEO-INFRA-STREAM-SPRINT-BRIDGE-001-A.

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
  const ADVISORY_STAGES = [16, 23];  // SD-MAN-FIX-FIX-NULL-DECISION-001: removed 3,5 (kill gates must not get pre-approved advisory rows)
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

  // ── 7e. Taste gate evaluation (S10, S13, S16) ──
  const TASTE_GATE_STAGES = [10, 13, 16];
  let tasteGateResult = null;
  if (TASTE_GATE_STAGES.includes(resolvedStage) && !options.dryRun) {
    try {
      const { data: configRow } = await supabase
        .from('chairman_dashboard_config')
        .select('taste_gate_config')
        .limit(1)
        .single();

      const tasteConfig = configRow?.taste_gate_config || {};
      const stageKey = `s${resolvedStage}_enabled`;
      const isEnabled = tasteConfig[stageKey] === true;

      if (isEnabled) {
        const dimensionScores = stageOutput?.taste_scores
          || stageOutput?.dimension_scores
          || stageOutput?.quality_scores
          || {};

        tasteGateResult = scoreTasteGate(resolvedStage, dimensionScores);
        const summary = buildTasteSummary(tasteGateResult, resolvedStage);
        logger.log(`[Eva] Taste gate S${resolvedStage}: ${summary}`);

        await recordGateResult(supabase, {
          ventureId,
          stageNumber: resolvedStage,
          gateType: `taste_gate_s${resolvedStage}`,
          passed: tasteGateResult.verdict !== TASTE_VERDICT.ESCALATE,
          score: tasteGateResult.meanScore,
          details: { verdict: tasteGateResult.verdict, reason: tasteGateResult.reason, dimensionResults: tasteGateResult.dimensionResults },
        });

        if (tasteGateResult.verdict === TASTE_VERDICT.ESCALATE) {
          // SD-LEO-ORCH-REPLACE-GOOGLE-STITCH-001-B: Stitch provision removed.
          // Archetype generation now triggered via S17 route (wireframe_screens artifact path).
          logger.log(`[Eva] Taste gate ESCALATE → Stitch removed, archetype generation deferred to S17`);
        }
      } else {
        logger.log(`[Eva] Taste gate S${resolvedStage}: disabled in config (${stageKey}=false)`);
      }
    } catch (tgErr) {
      logger.warn(`[Eva] Taste gate evaluation failed (non-fatal): ${tgErr.message}`);
    }
  }

  // ── 8. Advance stage (conditional) ──
  // ── 8a. Vision status transition: Stage 5 pass → active ──
  if (resolvedStage === 5 && visionKey && !gateBlocked && !options.dryRun) {
    try {
      await supabase.from('eva_vision_documents')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('vision_key', visionKey);
      logger.log(`[Eva] Vision ${visionKey} activated (stage 5 passed)`);
    } catch (activateErr) {
      logger.warn(`[Eva] Vision activation failed (non-fatal): ${activateErr.message}`);
    }
  }

  let nextStageId = null;
  if (filterDecision.action === FILTER_ACTION.AUTO_PROCEED && autoProceed && !options.dryRun) {
    // SD-LEO-INFRA-UNIFIED-GATE-ENFORCEMENT-001: Check review-mode BEFORE advanceStage
    // to prevent the advance-then-revert race condition. The RPC now enforces this at
    // the DB level too, but checking here avoids phantom STAGE_COMPLETE events entirely.
    const { REVIEW_MODE_STAGES, CHAIRMAN_GATES } = await import('./gate-constants.js');
    const isBlockingStage = REVIEW_MODE_STAGES.has(resolvedStage) || CHAIRMAN_GATES.BLOCKING.has(resolvedStage);
    if (isBlockingStage) {
      logger.log(`[Eva] Stage ${resolvedStage} is a blocking gate (review/kill/promotion) — skipping internal advanceStage`);
    } else {
      try {
        const sm = new VentureStateMachine({ supabaseClient: supabase, ventureId });
        await sm.initialize();
        await advanceStage(supabase, {
          ventureId,
          fromStage: resolvedStage,
          toStage: nextStage,
          handoffData: { correlationId, stageId: resolvedStage, source: 'eva-orchestrator' },
        });
        nextStageId = nextStage;
        logger.log(`[Eva] Advanced venture ${ventureId} to stage ${nextStage}`);
      } catch (err) {
        logger.warn(`[Eva] Stage advance failed (non-fatal): ${err.message}`);
      }
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
 * @param {number} [params.options.maxStages=26] - Max stages to process
 * @param {boolean} [params.options.autoProceed=true]
 * @param {string} [params.options.chairmanId]
 * @param {Object} deps - Injected dependencies
 * @returns {Promise<Object[]>} Ordered array of stage results
 */
export async function run({ ventureId, options = {} }, deps = {}) {
  const { logger = console } = deps;
  const maxStages = options.maxStages || 26;
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

// ── Exported for testing (re-exported from helpers) ─────────────

export const _internal = {
  buildResult,
  mergeArtifactOutputs,
  loadStageTemplate,
  persistArtifacts,
  checkIdempotency,
  loadUpstreamArtifacts,
  STATUS,
  FILTER_ACTION,
  ANALYSIS_DEPTH,
  selectAnalysisDepth,
};
