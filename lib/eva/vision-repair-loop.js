/**
 * lib/eva/vision-repair-loop.js
 *
 * Bounded LLM repair loop for eva_vision_documents that fail trigger-validated quality_checked.
 *
 * The BEFORE INSERT/UPDATE trigger `auto_validate_vision_quality`
 * (database/migrations/20260314_quality_validation_vision_docs.sql) silently overrides
 * caller-supplied `quality_checked=true` to `false` whenever content/sections fail thresholds
 * (>=5,000 chars content, >=8 of 10 standard sections, >=50 chars per section). Three downstream
 * enforcement triggers (vision/archplan advancement, SD phase past LEAD_APPROVAL) read
 * `quality_checked` and block transitions when false.
 *
 * This module provides post-write self-healing:
 *   1. After upsertVision() returns, caller checks quality_checked.
 *   2. If false AND created_by != exempt-stub-source AND flag enabled: invoke repairVision().
 *   3. Repair loop iterates up to attemptCap (default 2), routing per quality_issues.check
 *      to a repair-prompt strategy, regenerating via the injected `regenerate` callable,
 *      re-upserting, and re-reading quality_checked.
 *   4. Loop exits on success / attempt-cap / token-budget / unknown-check fallback.
 *   5. Idempotent on already-passing rows.
 *
 * Stub exemption uses created_by (the existing provenance field) and the advisory trigger
 * trg_vision_creation_source_advisory taxonomy. seed-l1-vision is the canonical Stage-1 stub
 * source — see scripts/eva/seed-l1-vision.js. Attempting repair on stubs would mask design
 * intent (stubs are intentionally low-quality at Stage 1).
 *
 * Feature flag: LEO_VISION_REPAIR_LOOP_ENABLED (env, default 'false') OR
 *               eva_venture_config row key=''vision_repair_loop_enabled'' OR
 *               key=''venture:<uuid>:vision_repair_loop_enabled''.
 *
 * Token budget: LEO_VISION_REPAIR_LOOP_TOKEN_BUDGET (env, default 540800 = 65 fail rows × 8000 × 1.04).
 *
 * Observability: 7 structured log signals (loop_entered, attempt_complete, loop_exit_success,
 *   loop_exit_cap, loop_exit_budget, loop_exit_unknown_check, loop_skipped_stub).
 *
 * Testability: `regenerate` is an injectable callable so unit tests pass deterministic
 *   mocks and never make real LLM calls.
 *
 * SD: SD-LEO-INFRA-EVA-STAGE-WORKER-001 (PRD-SD-LEO-INFRA-EVA-STAGE-WORKER-001)
 *
 * @module lib/eva/vision-repair-loop
 */

import { upsertVision } from './vision-upsert.js';

/**
 * Stage-1 stub seed sources that bypass the repair loop. Aligned with the advisory
 * trigger taxonomy in scripts/eva/seed-l1-vision.js / brainstorm-to-vision flow.
 */
const STUB_EXEMPT_VALUES = Object.freeze(['seed-l1-vision']);

/**
 * Quality issue check names emitted by trg_auto_validate_vision_quality.
 * Source: database/migrations/20260314_quality_validation_vision_docs.sql:50-91.
 */
const KNOWN_CHECKS = Object.freeze([
  'content_length',
  'section_coverage',
  'section_content',
  'sections_missing',
]);

const DEFAULT_ATTEMPT_CAP = 2;
const DEFAULT_TOKEN_BUDGET = 540800;

/**
 * Read flag state with global env + per-venture eva_venture_config override.
 *
 * @param {Object} params
 * @param {Object} params.supabase - Supabase service client
 * @param {string} [params.ventureId] - Venture UUID for per-venture override lookup
 * @returns {Promise<boolean>} True when the loop is enabled for this venture
 */
export async function isRepairLoopEnabled({ supabase, ventureId } = {}) {
  if (process.env.LEO_VISION_REPAIR_LOOP_ENABLED === 'true') {
    return true;
  }

  if (!supabase) return false;

  // Per-venture override takes precedence over global DB flag
  if (ventureId) {
    const { data: ventureRow } = await supabase
      .from('eva_venture_config')
      .select('value')
      .eq('key', `venture:${ventureId}:vision_repair_loop_enabled`)
      .maybeSingle();
    if (ventureRow?.value === true) return true;
    if (ventureRow?.value === false) return false; // explicit per-venture OFF beats global ON
  }

  const { data: globalRow } = await supabase
    .from('eva_venture_config')
    .select('value')
    .eq('key', 'vision_repair_loop_enabled')
    .maybeSingle();

  return globalRow?.value === true;
}

/**
 * Build a per-check repair prompt context. Routes by issue.check to a strategy
 * that targets the specific failure dimension. Unknown checks fall through to a
 * generic 'expand all sections' fallback.
 *
 * @param {Object} issue - {check, message} from quality_issues
 * @param {Object} state - {sections, content, visionKey}
 * @returns {{ strategy: string, hint: string, knownCheck: boolean }}
 */
export function routeRepairPrompt(issue, state) {
  const check = issue?.check;
  const knownCheck = KNOWN_CHECKS.includes(check);

  switch (check) {
    case 'content_length':
      return {
        strategy: 'expand_content',
        hint: `Expand content to >=5000 chars (current: ${(state.content || '').length}). Preserve all section headings; deepen prose with concrete details, examples, and decision rationale per section.`,
        knownCheck: true,
      };
    case 'section_coverage':
      return {
        strategy: 'fill_missing_sections',
        hint: 'At least 8 of 10 standard sections required: executive_summary, problem_statement, success_criteria, personas, out_of_scope, evolution_plan, information_architecture, key_decision_points, integration_patterns, ui_ux_wireframes. Generate concrete content for any sections currently missing or marked "[Section pending]".',
        knownCheck: true,
      };
    case 'section_content':
      return {
        strategy: 'expand_stub_sections',
        hint: 'Each present section must contain >=50 chars of substantive content. Replace stub markers and short placeholder text with concrete prose grounded in the venture artifacts.',
        knownCheck: true,
      };
    case 'sections_missing':
      return {
        strategy: 'generate_sections_jsonb',
        hint: 'sections JSONB is null. Generate a complete object with all 10 standard keys mapped to substantive content (>=50 chars each).',
        knownCheck: true,
      };
    default:
      return {
        strategy: 'expand_all_sections',
        hint: `Unknown quality check '${check}'. Apply generic improvement: expand each section with concrete detail; ensure content >=5000 chars and 10 substantive sections.`,
        knownCheck: false,
      };
  }
}

/**
 * Bounded LLM repair loop for vision documents that failed trigger validation.
 *
 * Returns a structured exit envelope for the caller to log. NEVER throws on regen
 * errors — failures roll into the next attempt or trigger a non-blocking warning exit.
 *
 * @param {Object} params
 * @param {Object} params.supabase - Supabase service client
 * @param {string} params.visionKey - vision_key being repaired
 * @param {Array<{check: string, message: string}>} params.qualityIssues - From upsert return
 * @param {Object} params.sections - Current sections JSONB
 * @param {string} params.content - Current content text
 * @param {string} params.createdBy - Provenance tag from upsert (drives stub exemption)
 * @param {string} [params.ventureId] - For per-venture flag lookup
 * @param {string} [params.brainstormId] - Pass-through to upsertVision
 * @param {string} [params.level='L2'] - Pass-through to upsertVision
 * @param {Function} params.regenerate - Async ({strategy, hint, sections, content, issue}) => {sections, content, tokensUsed}
 * @param {number} [params.attemptCap=2] - Maximum regeneration attempts
 * @param {number} [params.tokenBudget] - Cumulative session token budget (default 540800)
 * @param {Object} [params.tokenUsage] - Mutable {used: number} ref for cross-call cumulative tracking
 * @param {Object} [params.logger=console] - Logger with .log/.warn methods
 * @returns {Promise<{exitReason: string, attempts: number, tokensUsed: number, finalQualityChecked: boolean, finalQualityIssues: Array, data: Object|null}>}
 */
export async function repairVision({
  supabase,
  visionKey,
  qualityIssues,
  sections,
  content,
  createdBy,
  ventureId,
  brainstormId,
  level = 'L2',
  regenerate,
  attemptCap = DEFAULT_ATTEMPT_CAP,
  tokenBudget,
  tokenUsage,
  logger = console,
} = {}) {
  if (!supabase) throw new Error('supabase client is required');
  if (!visionKey) throw new Error('visionKey is required');
  if (typeof regenerate !== 'function') throw new Error('regenerate callable is required');

  const budget = Number.isFinite(tokenBudget)
    ? tokenBudget
    : Number(process.env.LEO_VISION_REPAIR_LOOP_TOKEN_BUDGET) || DEFAULT_TOKEN_BUDGET;
  const usage = tokenUsage && typeof tokenUsage.used === 'number' ? tokenUsage : { used: 0 };

  // AC-3: Stub exemption — caller already checked, but defense-in-depth
  if (STUB_EXEMPT_VALUES.includes(createdBy)) {
    logger.log('[vision-repair-loop] loop_skipped_stub', { visionKey, createdBy });
    return {
      exitReason: 'stub_exempt',
      attempts: 0,
      tokensUsed: 0,
      finalQualityChecked: false,
      finalQualityIssues: qualityIssues || [],
      data: null,
    };
  }

  // AC-6: Idempotency — quality_checked already true means no work
  const issuesArr = Array.isArray(qualityIssues) ? qualityIssues : [];
  if (issuesArr.length === 0) {
    logger.log('[vision-repair-loop] idempotent_skip_already_passing', { visionKey });
    return {
      exitReason: 'idempotent',
      attempts: 0,
      tokensUsed: 0,
      finalQualityChecked: true,
      finalQualityIssues: [],
      data: null,
    };
  }

  logger.log('[vision-repair-loop] loop_entered', {
    visionKey,
    createdBy,
    qualityIssuesChecks: issuesArr.map((i) => i?.check).filter(Boolean),
    attemptCap,
    tokenBudget: budget,
    cumulativeUsage: usage.used,
  });

  let workingSections = { ...(sections || {}) };
  let workingContent = content || '';
  let lastQualityChecked = false;
  let lastQualityIssues = issuesArr;
  let lastData = null;
  let unknownCheckEncountered = false;

  for (let attempt = 1; attempt <= attemptCap; attempt += 1) {
    // AC-7: Token budget hard fence — check BEFORE regen so we never overshoot
    if (usage.used >= budget) {
      logger.warn('[vision-repair-loop] loop_exit_budget', {
        visionKey,
        attemptsUsed: attempt - 1,
        totalTokens: usage.used,
        budgetCap: budget,
        exitReason: 'token_budget',
        finalQualityIssues: lastQualityIssues,
      });
      return {
        exitReason: 'token_budget',
        attempts: attempt - 1,
        tokensUsed: usage.used,
        finalQualityChecked: lastQualityChecked,
        finalQualityIssues: lastQualityIssues,
        data: lastData,
      };
    }

    // Pick the highest-priority issue to target this attempt. content_length is
    // the dominant failure (83% per FR-8 diagnostic) so prefer it when present;
    // otherwise pick the first remaining issue.
    const targetIssue = lastQualityIssues.find((i) => i?.check === 'content_length') || lastQualityIssues[0];
    const route = routeRepairPrompt(targetIssue, { sections: workingSections, content: workingContent, visionKey });
    if (!route.knownCheck) unknownCheckEncountered = true;

    let regenResult;
    try {
      regenResult = await regenerate({
        strategy: route.strategy,
        hint: route.hint,
        issue: targetIssue,
        sections: workingSections,
        content: workingContent,
        visionKey,
        attempt,
      });
    } catch (regenErr) {
      logger.warn('[vision-repair-loop] regen_failed', {
        visionKey,
        attempt,
        error: regenErr?.message || String(regenErr),
      });
      // Treat as a failed attempt — count toward cap, continue loop
      continue;
    }

    const tokensThisAttempt = Number(regenResult?.tokensUsed) || 0;
    usage.used += tokensThisAttempt;

    if (regenResult?.sections) workingSections = regenResult.sections;
    if (regenResult?.content) workingContent = regenResult.content;

    const { data: retryData, error: retryErr } = await upsertVision({
      supabase,
      visionKey,
      level,
      content: workingContent,
      sections: workingSections,
      ventureId,
      brainstormId,
      createdBy,
    });

    logger.log('[vision-repair-loop] attempt_complete', {
      visionKey,
      attempt,
      strategy: route.strategy,
      tokensUsedThisAttempt: tokensThisAttempt,
      cumulativeTokens: usage.used,
      qualityCheckedAfter: retryData?.quality_checked === true,
      retryError: retryErr?.message || null,
    });

    if (!retryErr && retryData?.quality_checked) {
      logger.log('[vision-repair-loop] loop_exit_success', {
        visionKey,
        attemptsUsed: attempt,
        totalTokens: usage.used,
        finalQualityChecked: true,
      });
      return {
        exitReason: 'success',
        attempts: attempt,
        tokensUsed: usage.used,
        finalQualityChecked: true,
        finalQualityIssues: [],
        data: retryData,
      };
    }

    lastQualityChecked = retryData?.quality_checked === true;
    lastQualityIssues = Array.isArray(retryData?.quality_issues)
      ? retryData.quality_issues
      : lastQualityIssues;
    lastData = retryData || lastData;
  }

  // AC-4: Attempt cap reached without success
  const exitReason = unknownCheckEncountered ? 'unknown_check' : 'attempt_cap';
  logger[exitReason === 'unknown_check' ? 'warn' : 'warn']( // both are warn-level
    `[vision-repair-loop] loop_exit_${exitReason}`,
    {
      visionKey,
      attemptsUsed: attemptCap,
      totalTokens: usage.used,
      finalQualityChecked: lastQualityChecked,
      finalQualityIssues: lastQualityIssues,
      exitReason,
    }
  );

  return {
    exitReason,
    attempts: attemptCap,
    tokensUsed: usage.used,
    finalQualityChecked: lastQualityChecked,
    finalQualityIssues: lastQualityIssues,
    data: lastData,
  };
}

export const __test__ = {
  STUB_EXEMPT_VALUES,
  KNOWN_CHECKS,
  DEFAULT_ATTEMPT_CAP,
  DEFAULT_TOKEN_BUDGET,
};
