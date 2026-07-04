/**
 * Organic-only channel provisioning for MarketLens's owned-audience content loop.
 * SD-LEO-FEAT-MARKETLENS-OWNED-AUDIENCE-001
 *
 * The live distribution_channel_config venture_artifacts row for MarketLens is a
 * Stage-22 skip-stub that lists a PAID channel (google_ads, active) alongside organic
 * ones. This module NEVER reads that stub's channel list verbatim — it filters to an
 * explicit organic-only allowlist so a paid channel can never be selected, even if the
 * stub marks it active.
 */

const ORGANIC_CHANNEL_TYPES = Object.freeze(['blog_seo', 'twitter_x', 'email', 'facebook_instagram']);
const PAID_CHANNEL_TYPES = Object.freeze(['google_ads']);

/**
 * Pure function: given the raw channels ARRAY emitted by Stage 22
 * (distribution_channel_config's artifact_data.channels — confirmed live shape:
 * [{channel: 'blog_seo', status: 'active', ad_copy: {...}, targeting: {...}}, ...]),
 * select exactly one organic channel. Hard-excludes anything in PAID_CHANNEL_TYPES
 * even if present and marked active.
 *
 * @param {Array<{channel: string, status: string}>} channels
 * @returns {{channelType: string|null, reason: string}}
 */
export function selectOrganicChannel(channels) {
  if (!Array.isArray(channels)) {
    return { channelType: null, reason: 'no_channel_config_provided' };
  }

  const candidates = channels.filter(
    (c) => c && ORGANIC_CHANNEL_TYPES.includes(c.channel) && !PAID_CHANNEL_TYPES.includes(c.channel) && c.status === 'active'
  );

  if (candidates.length === 0) {
    return { channelType: null, reason: 'no_active_organic_channel_in_config' };
  }

  // Deterministic preference order: blog_seo > twitter_x > email > facebook_instagram
  const preferenceOrder = ['blog_seo', 'twitter_x', 'email', 'facebook_instagram'];
  const [chosen] = candidates.sort(
    (a, b) => preferenceOrder.indexOf(a.channel) - preferenceOrder.indexOf(b.channel)
  );

  return { channelType: chosen.channel, reason: 'selected_from_organic_allowlist' };
}

/**
 * I/O wrapper: reads the live distribution_channel_config artifact for a venture,
 * selects an organic channel, resolves the corresponding distribution_channels row,
 * stores credentials via the secrets machinery, and inserts a venture_distribution_channels
 * row (budget_usd=0, enforced at the schema level). Idempotent: returns the existing row
 * if one already exists for this venture instead of creating a duplicate.
 *
 * @param {Object} params
 * @param {string} params.ventureId
 * @param {Object} [params.credentials] - Credential payload to store via secrets machinery
 * @param {Object} deps
 * @param {Object} deps.supabase
 * @param {Function} [deps.storeSecret] - (ventureId, channelType, credentials) => Promise<string> credentialRef
 * @param {Object} [deps.logger]
 * @returns {Promise<{ok: boolean, channelType?: string, venturedistributionChannelId?: string, reason?: string}>}
 */
export async function provisionOrganicChannel({ ventureId, credentials }, deps = {}) {
  const { supabase, storeSecret, logger = console } = deps;

  if (!supabase) {
    return { ok: false, reason: 'no_supabase_client' };
  }

  // Idempotency: a venture_distribution_channels row already exists for this venture.
  const { data: existing } = await supabase
    .from('venture_distribution_channels')
    .select('id, channel_id, is_organic')
    .eq('venture_id', ventureId)
    .maybeSingle();

  if (existing) {
    return { ok: true, venturedistributionChannelId: existing.id, reason: 'already_provisioned' };
  }

  const { data: artifact, error: artifactError } = await supabase
    .from('venture_artifacts')
    .select('artifact_data')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'distribution_channel_config')
    .maybeSingle();

  if (artifactError || !artifact) {
    logger.warn(`[OrganicProvisioning] No distribution_channel_config for venture ${ventureId}: ${artifactError?.message || 'not found'}`);
    return { ok: false, reason: 'no_distribution_channel_config' };
  }

  const { channelType, reason } = selectOrganicChannel(artifact.artifact_data?.channels || artifact.artifact_data);
  if (!channelType) {
    return { ok: false, reason };
  }

  const platformMap = { blog_seo: 'website', twitter_x: 'twitter', email: 'email', facebook_instagram: 'facebook' };
  const { data: channelRow, error: channelError } = await supabase
    .from('distribution_channels')
    .select('id')
    .eq('platform', platformMap[channelType] || channelType)
    .limit(1)
    .maybeSingle();

  if (channelError || !channelRow) {
    logger.warn(`[OrganicProvisioning] No distribution_channels row for platform ${channelType}: ${channelError?.message || 'not found'}`);
    return { ok: false, reason: 'distribution_channel_row_missing' };
  }

  let credentialRef = null;
  if (credentials && typeof storeSecret === 'function') {
    credentialRef = await storeSecret(ventureId, channelType, credentials);
  }

  const { data: inserted, error: insertError } = await supabase
    .from('venture_distribution_channels')
    .insert({
      venture_id: ventureId,
      channel_id: channelRow.id,
      is_organic: true,
      budget_usd: 0,
      credential_ref: credentialRef,
    })
    .select('id')
    .single();

  if (insertError) {
    logger.warn(`[OrganicProvisioning] Insert failed: ${insertError.message}`);
    return { ok: false, reason: insertError.message };
  }

  // Defense-in-depth: publisher/index.js's internal checkBudget() reads a channel_budgets
  // row keyed by (venture_id, platform). Seed it at zero so that mechanism ALSO blocks any
  // paid-cost path, in addition to the primary venture_distribution_channels.budget_usd
  // check performed by owned-audience-content-loop.js before publish() is ever called.
  const publisherPlatformKey = { blog_seo: 'website', twitter_x: 'x', email: 'email', facebook_instagram: 'facebook' }[channelType] || channelType;
  const { error: budgetSeedError } = await supabase
    .from('channel_budgets')
    .upsert(
      { venture_id: ventureId, platform: publisherPlatformKey, monthly_budget_cents: 0, daily_limit_cents: 0, status: 'active' },
      { onConflict: 'venture_id,platform' }
    );
  if (budgetSeedError) {
    logger.warn(`[OrganicProvisioning] channel_budgets zero-seed failed (non-fatal, primary gate still enforced): ${budgetSeedError.message}`);
  }

  return { ok: true, channelType, venturedistributionChannelId: inserted.id };
}

export const _internal = { ORGANIC_CHANNEL_TYPES, PAID_CHANNEL_TYPES };
