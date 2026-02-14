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

  // Check budget before publishing
  const budgetCheck = await checkBudget(supabase, ventureId, platform);
  if (!budgetCheck.allowed) {
    return { success: false, error: budgetCheck.reason };
  }

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

  // Publish via adapter
  const adapter = new AdapterClass(options);
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
    return { allowed: true }; // No budget configured = no restrictions
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
