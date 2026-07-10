/**
 * Publisher Abstraction Layer
 * SD-EVA-FEAT-MARKETING-FOUNDATION-001
 *
 * Platform-agnostic publishing interface with adapters for each platform.
 * Handles UTM parameter generation, idempotency, and rate limiting.
 */

import { XAdapter } from './adapters/x.js';
import { BlueskyAdapter } from './adapters/bluesky.js';
import { generateUTMParams } from '../utm.js';
import { checkRateLimit, checkPublishAuthorization } from '../autonomy-gate.js';
import { resolveChannelCredentials } from '../channel-secrets.js';
import { isKillswitchClear } from '../../venture-deploy/spend-guardrails.js';

const ADAPTERS = {
  x: XAdapter,
  bluesky: BlueskyAdapter
};

/**
 * Publish content to a platform
 * @param {object} params
 * @param {object} params.supabase - Supabase client
 * @param {object} params.content - { id, body, headline, cta, url }
 * @param {string} params.platform - Target platform
 * @param {object} params.options - Platform-specific options
 * @param {string} params.ventureId - Venture UUID
 * @param {string} [params.campaignId] - Campaign UUID for UTM
 * @returns {Promise<{success: boolean, postId?: string, postUrl?: string, error?: string}>}
 */
export async function publish({ supabase, content, platform, options = {}, ventureId, campaignId }) {
  const AdapterClass = ADAPTERS[platform];
  if (!AdapterClass) {
    return { success: false, error: `Unsupported platform: ${platform}. Supported: ${Object.keys(ADAPTERS).join(', ')}` };
  }

  // Generate idempotency key
  const idempotencyKey = `${ventureId}:${content.id}:${platform}:${Math.floor(Date.now() / 1000)}`;

  // Check for duplicate dispatch
  const { data: existing } = await supabase
    .from('campaign_content')
    .select('id, external_post_id')
    .eq('idempotency_key', idempotencyKey)
    .limit(1);

  if (existing && existing.length > 0) {
    return { success: true, postId: existing[0].external_post_id, deduplicated: true };
  }

  // SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-C FR-3: fail-closed autonomy gate.
  // MUST run before adapter construction — this is the enforcement chokepoint every
  // caller (content-pipeline.js, owned-audience-content-loop.js) passes through.
  // No log-only branch: a missing/errored read here denies the publish attempt.
  const authCheck = await checkPublishAuthorization({
    supabase, ventureId, channelType: platform, contentId: content.id, correlationId: idempotencyKey
  });
  if (!authCheck.allowed) {
    return { success: false, error: authCheck.reason, blockedBy: 'autonomy-gate' };
  }

  // FR-1: durable, DB-backed rate limit — replaces the prior in-memory limiter, which
  // reset every call because a fresh adapter was constructed per publish().
  const rateCheck = await checkRateLimit({ supabase, ventureId, channelType: platform });
  if (!rateCheck.allowed) {
    return { success: false, error: rateCheck.reason, blockedBy: 'rate-limit' };
  }

  // FR-6: honor the chairman kill-switch / human-gate posture, mirroring the S19 deploy
  // gate — a chairman kill-switch flip now halts an in-flight/pending marketing publish
  // the same way it halts an in-flight deploy.
  const killswitch = await isKillswitchClear(supabase, ventureId);
  if (!killswitch.clear) {
    return { success: false, error: killswitch.reason, blockedBy: 'spend-guardrail' };
  }

  // Check budget before publishing (channel_budgets remains the primary spend throttle —
  // FR-6 adds the kill-switch check above alongside it, not a replacement)
  const budgetCheck = await checkBudget(supabase, ventureId, platform);
  if (!budgetCheck.allowed) {
    return { success: false, error: budgetCheck.reason };
  }

  // FR-1: resolve per-venture credentials via secret_ref. Unresolvable (no ref on
  // record, or the ref can't be resolved) fails closed to null — adapters treat null
  // credentials as "no creds supplied" and fall back to their own dry-run path; they
  // NEVER fall through to a shared/default identity.
  const resolvedCredentials = await resolveChannelCredentials({ supabase, ventureId, channelType: platform });

  // Append UTM parameters to any URLs in the content
  const utm = generateUTMParams({
    source: platform,
    medium: 'social',
    campaign: campaignId || content.id,
    content: content.variantKey || 'default'
  });

  const enrichedContent = {
    ...content,
    body: appendUTMToUrls(content.body, utm),
    utm
  };

  // Publish via adapter — resolved per-venture credentials (if any) take precedence
  // over whatever the caller passed in options, so a caller can never accidentally
  // route one venture's post through another venture's credentials.
  const adapter = new AdapterClass({ ...options, ...(resolvedCredentials || {}) });
  try {
    const result = await adapter.publish(enrichedContent);

    // Record the dispatch
    if (result.success && campaignId) {
      await supabase.from('campaign_content').upsert({
        campaign_id: campaignId,
        content_id: content.id,
        platform,
        dispatched_at: new Date().toISOString(),
        dispatch_status: 'dispatched',
        idempotency_key: idempotencyKey,
        external_post_id: result.postId || null
      }, { onConflict: 'idempotency_key' });
    }

    // Record attribution event
    await supabase.from('marketing_attribution').insert({
      venture_id: ventureId,
      content_id: content.id,
      variant_id: content.variantId || null,
      campaign_id: campaignId || null,
      platform,
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      utm_content: utm.utm_content,
      event_type: 'dispatch'
    });

    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Check if budget allows publishing
 */
async function checkBudget(supabase, ventureId, platform) {
  const { data: budget } = await supabase
    .from('channel_budgets')
    .select('*')
    .eq('venture_id', ventureId)
    .eq('platform', platform)
    .single();

  if (!budget) {
    // Fail CLOSED: no budget row means spend is unbounded/untracked, not unrestricted.
    return { allowed: false, reason: 'No budget configured for this venture/platform' };
  }

  if (budget.status === 'exceeded') {
    return { allowed: false, reason: 'Monthly budget exceeded' };
  }

  if (budget.current_month_spend_cents >= budget.monthly_budget_cents) {
    return { allowed: false, reason: `Monthly budget exceeded: ${budget.current_month_spend_cents}/${budget.monthly_budget_cents} cents` };
  }

  if (budget.daily_limit_cents && budget.current_day_spend_cents >= budget.daily_limit_cents) {
    return { allowed: false, reason: `Daily budget exceeded: ${budget.current_day_spend_cents}/${budget.daily_limit_cents} cents` };
  }

  return { allowed: true };
}

/**
 * Append UTM parameters to URLs found in text
 */
function appendUTMToUrls(text, utm) {
  if (!text) return text;
  const utmString = Object.entries(utm)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

  return text.replace(/(https?:\/\/[^\s)]+)/g, (url) => {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${utmString}`;
  });
}

/**
 * Get list of supported platforms
 */
export function getSupportedPlatforms() {
  return Object.keys(ADAPTERS);
}
