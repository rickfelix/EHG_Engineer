/**
 * Chairman Review Flow
 *
 * Presents the synthesized venture brief to the chairman for review.
 * The chairman can edit, approve (send to Stage 1), or park in the Venture Nursery.
 *
 * Captures raw_chairman_intent as an immutable record before any system modifications.
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-B
 */

import { validateVentureBrief } from './interfaces.js';
import { parkVenture } from './venture-nursery.js';
// SD-LEO-INFRA-STAGE0-CHAIRMAN-DECISION-AUTHORITY-001: the real chairman gate, un-parked.
// A 'ready' verdict mints a PENDING decision and pauses — the machine RANKS, the chairman PICKS
// (spec R7; Delta-C1 / Solomon FIX-2 shape, advisory a8eafc72).
import { createOrReusePendingDecision } from '../chairman-decision-watcher.js';
import { writeArtifact } from '../artifact-persistence-service.js';
import { toDbArchetype } from './synthesis/archetype-mapping.js';

/**
 * SD-LEO-INFRA-STAGE0-POSTURE-SUCCESSOR-001 (CH-9, spec R1): the factory's scarce
 * resources are chairman attention and focus — at most `wip_limit` live ventures at
 * a time. The one-setting queue-claim gate refuses creation at/over the limit, loudly.
 */
export class WipLimitExceededError extends Error {
  constructor({ limit, currentCount, settingSource }) {
    super(`WIP limit reached: ${currentCount} live venture(s) with wip_limit=${limit} (${settingSource}) — complete or kill a live venture, or raise eva_config key '${WIP_LIMIT_CONFIG_KEY}' (spec R1 at-most-one-live-venture discipline)`);
    this.name = 'WipLimitExceededError';
    this.limit = limit;
    this.current_count = currentCount;
    this.setting_source = settingSource;
  }
}

/** The one setting (chairman-adjustable at runtime; spec R1 default = 1). */
export const WIP_LIMIT_CONFIG_KEY = 'stage0.wip_limit';
const WIP_LIMIT_DEFAULT = 1;

/**
 * Read the WIP limit live from eva_config. Unset/unparseable → the spec R1 default (1).
 * @returns {Promise<{limit: number, source: string}>}
 */
async function readWipLimit(supabase) {
  const { data } = await supabase
    .from('eva_config')
    .select('value')
    .eq('key', WIP_LIMIT_CONFIG_KEY)
    .maybeSingle();
  const parsed = Number.parseInt(data?.value, 10);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return { limit: parsed, source: `eva_config:${WIP_LIMIT_CONFIG_KEY}` };
  }
  return { limit: WIP_LIMIT_DEFAULT, source: 'default (setting unset)' };
}

/**
 * Present brief to the chairman and process their decision.
 *
 * @param {Object} brief - The venture brief to review
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger
 * @returns {Promise<Object>} Review result with decision and final brief
 */
export async function conductChairmanReview(brief, deps = {}) {
  const { supabase, logger = console } = deps;

  if (!supabase) {
    throw new Error('supabase client is required');
  }

  // Capture raw chairman intent BEFORE any modifications
  const rawChairmanIntent = brief.raw_chairman_intent || brief.problem_statement || '';

  logger.log('\n   Chairman Review');
  logger.log('   ' + '─'.repeat(50));
  logger.log(`   Venture: ${brief.name}`);
  logger.log(`   Problem: ${brief.problem_statement}`);
  logger.log(`   Solution: ${brief.solution}`);
  logger.log(`   Market: ${brief.target_market}`);
  logger.log(`   Origin: ${brief.origin_type}`);
  if (brief.archetype) logger.log(`   Archetype: ${brief.archetype}`);
  if (brief.moat_strategy) logger.log(`   Moat: ${JSON.stringify(brief.moat_strategy)}`);
  if (brief.portfolio_synergy_score !== undefined) {
    logger.log(`   Portfolio Synergy: ${brief.portfolio_synergy_score}`);
  }
  if (brief.time_horizon_classification) {
    logger.log(`   Time Horizon: ${brief.time_horizon_classification}`);
  }
  logger.log('   ' + '─'.repeat(50));

  // Map maturity to decision: blocked/nursery → park, everything else → direct maturity
  const maturity = brief.maturity || 'ready';
  const decision = (maturity === 'blocked' || maturity === 'nursery') ? 'park' : maturity;

  // Validate the brief before proceeding
  const validation = validateVentureBrief({
    ...brief,
    raw_chairman_intent: rawChairmanIntent,
  });

  return {
    decision, // 'ready' | 'seed' | 'sprout' | 'park'
    brief: {
      ...brief,
      raw_chairman_intent: rawChairmanIntent,
      maturity,
    },
    validation,
    reviewed_at: new Date().toISOString(),
  };
}

/**
 * Persist the approved venture brief to the database.
 *
 * @param {Object} reviewResult - Result from conductChairmanReview
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger
 * @returns {Promise<Object>} Created venture record
 */
export async function persistVentureBrief(reviewResult, deps = {}) {
  // SD-LEO-FIX-FIX-STAGE-QUEUE-001: requestId is threaded from the Stage-0 queue processor so the
  // created venture carries a durable back-reference to its originating stage_zero_requests row.
  // This lets the processor detect "this request already made a venture" even when the request's
  // own venture_id write was lost to a mid-run process death — preventing duplicate synthesis.
  const { supabase, logger = console, requestId = null } = deps;

  if (!supabase) {
    throw new Error('supabase client is required');
  }

  const { brief, decision } = reviewResult;

  if (decision === 'ready') {
    // SD-LEO-INFRA-STAGE0-POSTURE-SUCCESSOR-001 (CH-9): WIP one-setting queue-claim gate.
    // Order matters: the same-name idempotency lookup runs FIRST so a stale-claim
    // re-run of an already-created venture returns the existing record instead of
    // being refused by the gate (the 23505 recovery path stays intact below as a
    // race backstop).
    const { data: existingByName } = await supabase
      .from('ventures')
      .select()
      .eq('name', brief.name)
      .in('status', ['active', 'paused'])
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existingByName) {
      logger.warn(`   Venture "${brief.name}" already active (${existingByName.id}); returning existing (idempotent re-run, WIP gate bypassed by identity).`);
      return existingByName;
    }

    const { limit: wipLimit, source: wipSource } = await readWipLimit(supabase);
    const { count: liveCount, error: countErr } = await supabase
      .from('ventures')
      .select('*', { count: 'exact', head: true })
      .in('status', ['active', 'paused']);
    if (countErr) {
      // Fail closed: an unknowable live count cannot justify creating another venture.
      throw new WipLimitExceededError({ limit: wipLimit, currentCount: -1, settingSource: `${wipSource}; live count unavailable: ${countErr.message}` });
    }
    if ((liveCount ?? 0) >= wipLimit) {
      throw new WipLimitExceededError({ limit: wipLimit, currentCount: liveCount, settingSource: wipSource });
    }

    // Resolve company_id: use provided value, or default to EHG company
    let companyId = deps.company_id || brief.company_id;
    if (!companyId) {
      const { data: ehg } = await supabase
        .from('companies')
        .select('id')
        .eq('name', 'EHG')
        .limit(1)
        .single();
      companyId = ehg?.id || null;
    }

    // Create venture in ventures table for Stage 1
    // SD-LEO-FIX-FIX-STAGE-VENTURE-001: Write typed columns, not just metadata
    // PAT-TAXONOMY-COLLISION-001: Map synthesis archetype to DB archetype
    const dbArchetype = toDbArchetype(brief.archetype);
    const { data: venture, error } = await supabase
      .from('ventures')
      .insert({
        name: brief.name,
        description: brief.problem_statement,
        problem_statement: brief.problem_statement,
        solution: brief.solution,
        raw_chairman_intent: brief.raw_chairman_intent,
        archetype: dbArchetype,
        moat_strategy: brief.moat_strategy,
        portfolio_synergy_score: brief.portfolio_synergy_score,
        time_horizon_classification: brief.time_horizon_classification,
        build_estimate: brief.build_estimate,
        discovery_strategy: brief.discovery_strategy,
        target_market: brief.target_market,
        origin_type: brief.origin_type,
        // SD-LEO-INFRA-CLEAN-CLONE-LAUNCH-001-A (FR-3): stamp clean-clone provenance when the
        // brief was reseeded from an existing venture (origin_type='seeded_from_venture'). Null
        // for all other paths. current_lifecycle_stage stays 1 so the clone re-runs S0 fresh.
        seeded_from_venture_id: brief.seeded_from_venture_id || brief.metadata?.seeded_from_venture_id || null,
        current_lifecycle_stage: 1,
        // SD-LEO-INFRA-STAGE0-CHAIRMAN-DECISION-AUTHORITY-001: 'ready' PAUSES — the venture is
        // born paused-awaiting and only the activation consumer (decision-activation.js) flips it
        // active on an authentic chairman approval. Never insert active here.
        status: 'paused',
        company_id: companyId,
        metadata: {
          // SD-LEO-INFRA-STAGE0-THESIS-CONTRACT-001: the thesis + pre-registered kill
          // criteria + explicit decisions live ON the venture record — downstream gates
          // (S20-26 O2) arm kill_criteria as live gauges, and stack scans consume the
          // form-factor decision instead of assuming web.
          thesis: brief.thesis || null,
          kill_criteria: brief.kill_criteria || null,
          explicit_decisions: brief.explicit_decisions || null,
          stage_zero: {
            // SD-LEO-INFRA-STAGE0-CHAIRMAN-DECISION-AUTHORITY-001: the pause contract the
            // activation consumer (decision-activation.js) keys on — cleared on activation.
            awaiting_chairman_decision: true,
            pause_provenance: {
              minted_by: 'stage0-chairman-gate',
              paused_at: new Date().toISOString(),
            },
            // SD-LEO-FIX-FIX-STAGE-QUEUE-001: durable request→venture link (idempotency anchor).
            stage_zero_request_id: requestId,
            solution: brief.solution,
            raw_chairman_intent: brief.raw_chairman_intent,
            synthesis_archetype: brief.archetype,
            db_archetype: dbArchetype,
            moat_strategy: brief.moat_strategy,
            portfolio_synergy_score: brief.portfolio_synergy_score,
            time_horizon_classification: brief.time_horizon_classification,
            build_estimate: brief.build_estimate,
            // SD-LEO-INFRA-STAGE0-TRAVERSABILITY-REACH-001 (adversarial-review CRITICAL
            // fix): persist so a future seeded_from_venture reseed can carry it forward
            // (venture-reseeding.js reads this exact path) instead of always seeing
            // undefined.
            required_capabilities: brief.required_capabilities || null,
            cross_references: brief.cross_references,
            chairman_constraint_scores: brief.chairman_constraint_scores,
            // CH-7 (QF-20260710-467, Solomon adjudication a8eafc72, Charlie R1-R10 ledger
            // #5815): posture_version rides the run through synthesis but was dropped here —
            // the R9 reproducibility/provenance chain broke at the record with the longest
            // retention. Null-coalesced: posture is only resolved for the discovery_mode
            // strategy (other origin paths never had one to lose).
            posture: {
              posture_version: brief.metadata?.posture_version ?? null,
              posture_phase_key: brief.metadata?.posture_phase_key ?? null,
              weights_used: brief.metadata?.posture_criteria?.weights ?? null,
            },
            origin_metadata: {
              competitor_urls: brief.competitor_ref,
              blueprint_id: brief.blueprint_id,
              discovery_strategy: brief.discovery_strategy,
              // FR-4c (SD-LEO-ENH-TREND-SCANNER-SCORING-001): stamp prompt_version
              // when the brief carries one. Null/undefined for legacy ventures —
              // surfaced as 'v1-pre-versioning' via COALESCE in the closed-loop RPC.
              prompt_version: brief.prompt_version ?? brief.metadata?.prompt_version ?? null,
            },
          },
        },
      })
      .select()
      .single();

    if (error) {
      // SD-LEO-INFRA-STAGE-OPPORTUNITY-INTAKE-001 (F4): idempotency guard for stale-claim
      // re-execution. releaseStaleClaims can re-queue a request whose venture was already
      // created (the original run was interrupted before its 'completed' status-write landed).
      // The re-run re-inserts the same active venture name and trips the partial unique index
      // idx_ventures_unique_active_name (SQLSTATE 23505). Throwing here would mark the request
      // 'failed' even though it genuinely succeeded — so instead return the existing active
      // venture and let the re-run complete idempotently. A genuine synthesis failure throws
      // upstream (before this insert), so it is still recorded 'failed' with no orphan venture.
      if (error.code === '23505') {
        const { data: existingVenture } = await supabase
          .from('ventures')
          .select()
          .eq('name', brief.name)
          .in('status', ['active', 'paused'])
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (existingVenture) {
          logger.warn(`   Venture "${brief.name}" already active (${existingVenture.id}); returning existing (idempotent stale-claim re-run).`);
          // SD-LEO-INFRA-STAGE0-CHAIRMAN-DECISION-AUTHORITY-001: if the original run died between
          // the venture insert and the gate mint, the paused-awaiting venture has no pending
          // decision and would wedge forever. The mint is reuse-safe (createOrReusePendingDecision
          // returns the existing PENDING row), so re-mint here for paused-awaiting ventures. No
          // compensating cancel on this path — the venture pre-existed this run.
          if (existingVenture.status === 'paused' && existingVenture.metadata?.stage_zero?.awaiting_chairman_decision === true) {
            const reusedDecisionId = await mintStageZeroGate(existingVenture, brief, { supabase, logger, compensateOnFailure: false });
            return { ...existingVenture, stage_zero_decision_id: reusedDecisionId };
          }
          return existingVenture;
        }
      }
      throw new Error(`Failed to create venture: ${error.message}`);
    }

    // SD-LEO-INFRA-STAGE0-CHAIRMAN-DECISION-AUTHORITY-001: mint the REAL chairman gate.
    // This replaces the deleted machine-forged approval insert (status='approved' with a canned
    // rationale — Delta-C1). The mint is FAIL-CLOSED (flaw H5 class): a ready venture without a
    // pending decision must never exist, so a mint failure compensates the venture to cancelled
    // and rethrows instead of warn-and-continue.
    const decisionId = await mintStageZeroGate(venture, brief, { supabase, logger });

    // Persist Stage 0 artifact via Unified Persistence Service
    try {
      const synthesisData = brief.metadata?.synthesis || brief;
      await writeArtifact(supabase, {
        ventureId: venture.id,
        lifecycleStage: 0,
        artifactType: 'intake_venture_analysis',
        title: 'Stage 0 Synthesis',
        artifactData: synthesisData,
        source: 'chairman-review',
      });
    } catch (err) {
      logger.warn(`   Warning: Stage 0 artifact persistence failed (non-fatal): ${err.message}`);
    }

    // Also create venture_brief record for detailed tracking
    await persistBriefRecord(brief, venture.id, deps);

    logger.log(`   Venture created: ${venture.id}`);
    logger.log(`   Status: PAUSED awaiting chairman decision${decisionId ? ` (${decisionId})` : ''}`);

    return { ...venture, stage_zero_decision_id: decisionId };
  }

  // Park in Venture Nursery via parkVenture() for proper trigger/review tracking
  const parkReason = buildParkReason(brief);
  const triggerConditions = brief.metadata?.synthesis?.chairman_constraints?.conditions || [];
  const reviewSchedule = brief.maturity === 'blocked' ? '30d' : '90d';

  const nurseryEntry = await parkVenture(
    brief,
    { reason: parkReason, triggerConditions, reviewSchedule },
    { supabase, logger }
  );

  logger.log(`   Maturity: ${brief.maturity}`);

  return nurseryEntry;
}

/**
 * SD-LEO-INFRA-STAGE0-CHAIRMAN-DECISION-AUTHORITY-001: mint the Stage-0 chairman gate.
 *
 * Creates (or reuses) a PENDING chairman_decisions row for the paused venture via the same
 * machinery every other gate stage uses. forceDecisionCreation skips only the stage_creates_decision
 * predicate — stage 0 is deliberately absent from stage_config (see chairman-decision-watcher.js).
 * Fixture ventures (is_demo) still never mint; they stay paused as inert test data.
 *
 * Fail-closed: on mint failure the venture is compensated to status='cancelled' (fresh-create path
 * only — compensateOnFailure:false on the idempotent re-run path where the venture pre-existed)
 * and the error is rethrown so the request records 'failed' instead of silently succeeding.
 *
 * @param {Object} venture - The created (or existing) ventures row
 * @param {Object} brief - The venture brief
 * @param {Object} deps - { supabase, logger, compensateOnFailure }
 * @returns {Promise<string|null>} The decision id (null when skipped for a fixture venture)
 */
async function mintStageZeroGate(venture, brief, { supabase, logger = console, compensateOnFailure = true }) {
  try {
    const minted = await createOrReusePendingDecision({
      ventureId: venture.id,
      stageNumber: 0,
      decisionType: 'stage_gate',
      summary: 'Stage 0: venture awaiting chairman approval',
      briefData: {
        name: brief.name,
        problem_statement: brief.problem_statement,
        solution: brief.solution,
        target_market: brief.target_market,
        archetype: brief.archetype,
        venture_score: brief.metadata?.venture_score ?? null,
        provenance: { minted_by: 'stage0-machine', chairman_action_required: true },
      },
      forceDecisionCreation: true,
      supabase,
      logger,
    });
    return minted?.id || null;
  } catch (err) {
    if (compensateOnFailure) {
      try {
        // Adversarial-review round 1: NEVER cancel a venture that already has a live PENDING
        // gate decision — a concurrent duplicate-name request (23505 re-mint path) may have
        // minted one between our insert and our failed mint; cancelling would strand that live
        // decision in the chairman queue (approving it later becomes a silent no-op). If this
        // check itself fails, fail toward PAUSE (skip the cancel, retryable) — never toward
        // losing a chairman-visible decision.
        const { data: livePending, error: pendingCheckErr } = await supabase
          .from('chairman_decisions')
          .select('id')
          .eq('venture_id', venture.id)
          .eq('lifecycle_stage', 0)
          .eq('decision_type', 'stage_gate')
          .eq('status', 'pending')
          .limit(1)
          .maybeSingle();
        // supabase-js returns { data: null, error } on PostgREST faults instead of throwing —
        // a discarded error here would read as "no pending decision" and cancel anyway. A soft
        // check failure must also fail toward PAUSE.
        if (pendingCheckErr) {
          logger.warn(`   Skipping compensating cancel for venture ${venture.id}: live-pending check failed (${pendingCheckErr.message})`);
        } else if (!livePending) {
          await supabase
            .from('ventures')
            .update({
              status: 'cancelled',
              metadata: {
                ...(venture.metadata || {}),
                stage_zero: {
                  ...(venture.metadata?.stage_zero || {}),
                  awaiting_chairman_decision: false,
                  cancellation_reason: 'stage0_decision_mint_failed',
                },
              },
            })
            .eq('id', venture.id)
            .eq('status', 'paused'); // guard: only cancel the still-paused holding state
        } else {
          logger.warn(`   Skipping compensating cancel for venture ${venture.id}: live pending decision ${livePending.id} exists`);
        }
      } catch (compErr) {
        logger.warn(`   Compensating cancel failed for venture ${venture.id}: ${compErr.message}`);
      }
    }
    throw new Error(`Stage-0 chairman gate mint failed (fail-closed): ${err.message}`);
  }
}

/**
 * Persist a detailed brief record in venture_briefs table.
 *
 * @param {Object} brief - The venture brief
 * @param {string} ventureId - UUID of the created venture
 * @param {Object} deps - Injected dependencies
 */
async function persistBriefRecord(brief, ventureId, deps) {
  const { supabase, logger = console } = deps;

  const { error } = await supabase
    .from('venture_briefs')
    .insert({
      venture_id: ventureId,
      name: brief.name,
      problem_statement: brief.problem_statement,
      raw_chairman_intent: brief.raw_chairman_intent,
      solution: brief.solution,
      target_market: brief.target_market,
      origin_type: brief.origin_type,
      archetype: brief.archetype,
      moat_strategy: brief.moat_strategy,
      portfolio_synergy_score: brief.portfolio_synergy_score,
      time_horizon_classification: brief.time_horizon_classification,
      build_estimate: brief.build_estimate,
      cross_references: brief.cross_references,
      chairman_constraint_scores: brief.chairman_constraint_scores,
      competitor_ref: brief.competitor_ref,
      blueprint_id: brief.blueprint_id,
      discovery_strategy: brief.discovery_strategy,
      maturity: brief.maturity || 'ready',
      portfolio_evaluation: brief.portfolio_evaluation
        ?? brief.metadata?.synthesis?.portfolio_evaluation ?? null,
      problem_reframings: brief.problem_reframings
        ?? brief.metadata?.synthesis?.problem_reframing?.reframings ?? null,
    });

  if (error) {
    logger.warn(`   Warning: Failed to create brief record: ${error.message}`);
  }
}

/**
 * Build a human-readable parking reason from brief metadata.
 */
function buildParkReason(brief) {
  if (brief.maturity === 'blocked') {
    const verdict = brief.metadata?.synthesis?.chairman_constraints?.summary;
    return verdict ? `Chairman constraints failed: ${verdict}` : 'Failed chairman constraint checks';
  }
  if (brief.maturity === 'nursery') {
    const horizon = brief.metadata?.synthesis?.time_horizon?.summary;
    return horizon ? `Time horizon: ${horizon}` : 'Time horizon: park and build later';
  }
  return `Early maturity stage: ${brief.maturity}`;
}
