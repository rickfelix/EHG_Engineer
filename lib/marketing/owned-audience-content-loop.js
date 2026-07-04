/**
 * MarketLens owned-audience content loop: generate -> review-gate -> publish -> measure.
 * SD-LEO-FEAT-MARKETLENS-OWNED-AUDIENCE-001
 *
 * marketing_content_queue is the sole SSOT for this loop's review-gate state
 * (pending_review/in_review/approved/rejected) — content-generator.js's
 * marketing_content/marketing_content_variants tables are a DIFFERENT consumer's
 * lifecycle_state-keyed model and are never read by publishApprovedItem() or
 * generateAndQueue() below. Only buildGenerationPrompt/callLLMForVariants (the pure
 * LLM-calling helpers) are reused from content-generator.js.
 */

import { buildGenerationPrompt, callLLMForVariants } from './content-generator.js';
import { publish } from './publisher/index.js';
import { recordWrite, checkWriteBudget } from './marketlens-caps.js';
import { recordTokenUsage, checkBudget as checkTokenBudget } from '../eva/utils/token-tracker.js';

const TOKEN_BUDGET_PROFILE = 'deep_due_diligence'; // resolves to the 2,000,000-token limit in get_venture_token_budget_status

/**
 * Generate one content item and submit it into the review gate
 * (marketing_content_queue, status='pending_review'). Gated by both the token cap
 * and the write cap — a breach of either blocks the insert before it happens.
 *
 * @param {Object} params
 * @param {string} params.ventureId
 * @param {Object} params.ventureContext - { name, description, targetAudience, industry }
 * @param {string} [params.contentType='social_post']
 * @param {string} [params.platform='x']
 * @param {Object} deps
 * @param {Object} deps.supabase
 * @param {Object} [deps.logger]
 * @returns {Promise<{ok: boolean, queueItemId?: string, reason?: string}>}
 */
export async function generateAndQueue({ ventureId, ventureContext, contentType = 'social_post', platform = 'x' }, deps = {}) {
  const { supabase, logger = console } = deps;

  if (!supabase) return { ok: false, reason: 'no_supabase_client' };

  const tokenBudget = await checkTokenBudget(ventureId, { supabase, logger });
  if (tokenBudget?.is_over_budget) {
    return { ok: false, reason: 'token_cap_exceeded' };
  }

  const writeBudget = await checkWriteBudget(ventureId, { supabase, logger });
  if (writeBudget.isOverBudget) {
    return { ok: false, reason: writeBudget.error ? `write_cap_check_failed_closed: ${writeBudget.error}` : 'write_cap_exceeded' };
  }

  const prompt = buildGenerationPrompt(ventureContext, contentType, platform);
  const startedAt = Date.now();
  const variants = await callLLMForVariants(prompt);
  const chosen = variants[0];

  recordTokenUsage(
    {
      ventureId,
      stageId: null,
      usage: { inputTokens: Math.ceil(prompt.length / 4), outputTokens: Math.ceil((chosen.body?.length || 0) / 4) },
      metadata: { operationType: 'owned_audience_content_generation', budgetProfile: TOKEN_BUDGET_PROFILE, agentType: 'eva-content-loop' },
    },
    { supabase, logger }
  );

  const { data: queueItem, error } = await supabase
    .from('marketing_content_queue')
    .insert({
      venture_id: ventureId,
      title: chosen.headline,
      content_body: chosen.body,
      content_type: contentType,
      status: 'pending_review',
      priority: 0,
    })
    .select('id')
    .single();

  if (error) {
    logger.warn(`[OwnedAudienceLoop] Queue insert failed: ${error.message}`);
    return { ok: false, reason: error.message };
  }

  recordWrite({ ventureId, operationType: 'queue_insert', metadata: { queueItemId: queueItem.id, generationMs: Date.now() - startedAt } }, { supabase, logger });

  return { ok: true, queueItemId: queueItem.id };
}

/**
 * Publish an approved queue item. Checks the kill-switch and zero-budget enforcement
 * before calling the publisher — neither is a workaround of the publisher's own
 * checkBudget path, but a hard pre-gate specific to this organic-only venture.
 *
 * @param {Object} params
 * @param {string} params.queueItemId
 * @param {string} params.ventureId
 * @param {string} params.platform
 * @param {Object} deps
 * @param {Object} deps.supabase
 * @param {Object} [deps.logger]
 * @returns {Promise<{ok: boolean, reason?: string, published?: boolean}>}
 */
export async function publishApprovedItem({ queueItemId, ventureId, platform }, deps = {}) {
  const { supabase, logger = console } = deps;

  if (!supabase) return { ok: false, reason: 'no_supabase_client' };

  const { data: queueItem, error: fetchError } = await supabase
    .from('marketing_content_queue')
    .select('id, status, title, content_body, venture_id')
    .eq('id', queueItemId)
    .single();

  if (fetchError || !queueItem) {
    return { ok: false, reason: fetchError?.message || 'queue_item_not_found' };
  }

  if (queueItem.status !== 'approved') {
    return { ok: false, reason: `queue_item_not_approved (status=${queueItem.status})` };
  }

  const { data: guardrail, error: guardrailError } = await supabase
    .from('factory_guardrail_state')
    .select('kill_switch_active')
    .eq('venture_id', ventureId)
    .maybeSingle();

  if (guardrailError) {
    logger.warn(`[OwnedAudienceLoop] Guardrail lookup failed, refusing to publish (fail-closed): ${guardrailError.message}`);
    return { ok: false, reason: `kill_switch_check_failed_closed: ${guardrailError.message}` };
  }

  if (guardrail?.kill_switch_active === true) {
    logger.warn(`[OwnedAudienceLoop] Kill-switch active for venture ${ventureId} — aborting publish, queue item stays approved`);
    return { ok: false, reason: 'kill_switch_active' };
  }

  const { data: channelJoin, error: channelError } = await supabase
    .from('venture_distribution_channels')
    .select('id, budget_usd, is_organic')
    .eq('venture_id', ventureId)
    .maybeSingle();

  if (channelError || !channelJoin) {
    return { ok: false, reason: channelError?.message || 'no_provisioned_channel' };
  }

  if (Number(channelJoin.budget_usd) !== 0 || !channelJoin.is_organic) {
    logger.warn(`[OwnedAudienceLoop] Zero-budget enforcement rejected publish for venture ${ventureId}: budget_usd=${channelJoin.budget_usd}, is_organic=${channelJoin.is_organic}`);
    return { ok: false, reason: 'zero_budget_enforcement' };
  }

  const writeBudget = await checkWriteBudget(ventureId, { supabase, logger });
  if (writeBudget.isOverBudget) {
    return { ok: false, reason: writeBudget.error ? `write_cap_check_failed_closed: ${writeBudget.error}` : 'write_cap_exceeded' };
  }

  // Note: publisher/index.js's own checkBudget() reads a channel_budgets row keyed by
  // (venture_id, platform) — NOT the `options` param (that's adapter-constructor config
  // only). provisionOrganicChannel() seeds a monthly_budget_cents=0/daily_limit_cents=0
  // channel_budgets row for this venture+platform as defense-in-depth; the PRIMARY gate
  // is the venture_distribution_channels.budget_usd check immediately above.
  const result = await publish({
    supabase,
    content: { id: queueItem.id, title: queueItem.title, body: queueItem.content_body },
    platform,
    ventureId,
  });

  if (!result?.success) {
    return { ok: false, reason: result?.error || 'publish_failed' };
  }

  await supabase.from('marketing_content_queue').update({ status: 'posted' }).eq('id', queueItemId);
  recordWrite({ ventureId, operationType: 'publish', metadata: { queueItemId } }, { supabase, logger });

  return { ok: true, published: true };
}

/**
 * Compute a durable weekly audience/engagement snapshot for a venture from
 * distribution_history. Idempotent per (venture_id, week_start) — a second call for
 * an already-computed week is a no-op (does not overwrite, per the durable-snapshot
 * design: later distribution_history backfills must not silently move a reported number).
 *
 * @param {Object} params
 * @param {string} params.ventureId
 * @param {string} params.weekStart - ISO date (Monday, UTC) of the week to compute
 * @param {Object} deps
 * @param {Object} deps.supabase
 * @param {Object} [deps.logger]
 * @returns {Promise<{ok: boolean, alreadyComputed?: boolean, reason?: string}>}
 */
export async function computeWeeklyRollup({ ventureId, weekStart }, deps = {}) {
  const { supabase, logger = console } = deps;
  if (!supabase) return { ok: false, reason: 'no_supabase_client' };

  const { data: existing } = await supabase
    .from('venture_audience_weekly')
    .select('id')
    .eq('venture_id', ventureId)
    .eq('week_start', weekStart)
    .maybeSingle();

  if (existing) {
    return { ok: true, alreadyComputed: true };
  }

  const weekEnd = new Date(new Date(weekStart).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from('distribution_history')
    .select('clicks, impressions, engagement_rate')
    .eq('venture_id', ventureId)
    .gte('posted_at', weekStart)
    .lt('posted_at', weekEnd);

  if (error) {
    logger.warn(`[OwnedAudienceLoop] Weekly rollup query failed: ${error.message}`);
    return { ok: false, reason: error.message };
  }

  const aggregate = aggregateWeeklyMetrics(rows || []);

  const { error: insertError } = await supabase.from('venture_audience_weekly').insert({
    venture_id: ventureId,
    week_start: weekStart,
    clicks: aggregate.clicks,
    impressions: aggregate.impressions,
    engagement_rate: aggregate.engagementRate,
    post_count: aggregate.postCount,
  });

  if (insertError) {
    logger.warn(`[OwnedAudienceLoop] Weekly rollup insert failed: ${insertError.message}`);
    return { ok: false, reason: insertError.message };
  }

  recordWrite({ ventureId, operationType: 'measurement_write', metadata: { weekStart } }, { supabase, logger });

  return { ok: true, alreadyComputed: false };
}

/**
 * Pure aggregation function (no I/O) — sums clicks/impressions, averages engagement_rate.
 * @param {Array<{clicks:number, impressions:number, engagement_rate:number}>} rows
 * @returns {{clicks:number, impressions:number, engagementRate:number, postCount:number}}
 */
export function aggregateWeeklyMetrics(rows) {
  if (!rows || rows.length === 0) {
    return { clicks: 0, impressions: 0, engagementRate: 0, postCount: 0 };
  }
  const clicks = rows.reduce((sum, r) => sum + (r.clicks || 0), 0);
  const impressions = rows.reduce((sum, r) => sum + (r.impressions || 0), 0);
  const engagementRate = Number(
    (rows.reduce((sum, r) => sum + Number(r.engagement_rate || 0), 0) / rows.length).toFixed(2)
  );
  return { clicks, impressions, engagementRate, postCount: rows.length };
}
