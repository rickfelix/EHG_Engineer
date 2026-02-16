/**
 * Marketing Content Pipeline
 *
 * Orchestrates end-to-end content generation across multiple channels.
 * Coordinates content-generator → publisher → metrics collection.
 *
 * Part of SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-L
 *
 * @module lib/marketing/content-pipeline
 */

import { generateContent } from './content-generator.js';
import { publish, getSupportedPlatforms } from './publisher/index.js';
import { checkBudget, recordSpend } from './budget-governor.js';
import { generateUTMParams } from './utm.js';

// ── Pipeline Status Constants ───────────────────────────

export const PIPELINE_STATUS = Object.freeze({
  PENDING: 'pending',
  GENERATING: 'generating',
  REVIEWING: 'reviewing',
  PUBLISHING: 'publishing',
  PUBLISHED: 'published',
  FAILED: 'failed',
});

// ── Channel Definitions ─────────────────────────────────

const DEFAULT_CHANNELS = [
  { id: 'social', name: 'Social Media', contentType: 'social_post', platforms: ['x', 'bluesky'] },
  { id: 'email', name: 'Email Campaign', contentType: 'email', platforms: ['email'] },
  { id: 'ad', name: 'Paid Advertising', contentType: 'ad', platforms: ['google_ads'] },
];

// ── Content Pipeline ────────────────────────────────────

/**
 * Execute the full content pipeline for a venture across specified channels.
 *
 * @param {object} params
 * @param {object} params.supabase - Supabase client
 * @param {string} params.ventureId - Venture UUID
 * @param {object} params.ventureContext - { name, description, targetAudience, industry }
 * @param {string[]} [params.channelIds] - Specific channels to target (defaults to all)
 * @param {string} [params.campaignId] - Campaign to link content to
 * @param {object} [params.logger] - Logger
 * @returns {Promise<PipelineResult>}
 */
export async function executePipeline({
  supabase,
  ventureId,
  ventureContext,
  channelIds,
  campaignId,
  logger = console,
}) {
  const startedAt = new Date().toISOString();
  const channels = channelIds
    ? DEFAULT_CHANNELS.filter(c => channelIds.includes(c.id))
    : DEFAULT_CHANNELS;

  const results = [];
  let totalGenerated = 0;
  let totalPublished = 0;
  let totalFailed = 0;

  logger.log(`[ContentPipeline] Starting pipeline for venture ${ventureId} across ${channels.length} channels`);

  for (const channel of channels) {
    const channelResult = {
      channelId: channel.id,
      channelName: channel.name,
      status: PIPELINE_STATUS.PENDING,
      contentId: null,
      publishResults: [],
      error: null,
    };

    try {
      // Step 1: Check budget
      const budget = await checkBudget({ supabase, ventureId, channel: channel.id });
      if (budget && budget.remaining <= 0) {
        channelResult.status = PIPELINE_STATUS.FAILED;
        channelResult.error = 'Budget exhausted for channel';
        totalFailed++;
        results.push(channelResult);
        continue;
      }

      // Step 2: Generate content
      channelResult.status = PIPELINE_STATUS.GENERATING;
      const generated = await generateContent({
        supabase,
        ventureId,
        ventureContext,
        contentType: channel.contentType,
        platform: channel.platforms[0],
        campaignId,
      });
      channelResult.contentId = generated.contentId;
      totalGenerated++;

      // Step 3: Publish to each platform in the channel
      channelResult.status = PIPELINE_STATUS.PUBLISHING;
      for (const platform of channel.platforms) {
        const supported = getSupportedPlatforms();
        if (!supported.includes(platform)) {
          channelResult.publishResults.push({
            platform,
            success: false,
            error: `Platform ${platform} not supported`,
          });
          continue;
        }

        const pubResult = await publish({
          supabase,
          content: {
            id: generated.contentId,
            body: generated.variants?.[0]?.body || ventureContext.description,
            headline: generated.variants?.[0]?.headline || ventureContext.name,
            cta: generated.variants?.[0]?.cta || 'Learn more',
          },
          platform,
          ventureId,
          campaignId,
        });

        channelResult.publishResults.push({
          platform,
          ...pubResult,
        });

        if (pubResult.success) {
          totalPublished++;
          await recordSpend({ supabase, ventureId, channel: channel.id, amount: 0 });
        }
      }

      channelResult.status = PIPELINE_STATUS.PUBLISHED;
    } catch (err) {
      channelResult.status = PIPELINE_STATUS.FAILED;
      channelResult.error = err.message;
      totalFailed++;
      logger.error(`[ContentPipeline] Channel ${channel.id} failed: ${err.message}`);
    }

    results.push(channelResult);
  }

  const completedAt = new Date().toISOString();

  // Record pipeline run in database
  await recordPipelineRun(supabase, {
    ventureId,
    campaignId,
    startedAt,
    completedAt,
    channelCount: channels.length,
    totalGenerated,
    totalPublished,
    totalFailed,
  });

  logger.log(`[ContentPipeline] Complete: ${totalGenerated} generated, ${totalPublished} published, ${totalFailed} failed`);

  return {
    ventureId,
    startedAt,
    completedAt,
    channels: results,
    summary: {
      channelCount: channels.length,
      totalGenerated,
      totalPublished,
      totalFailed,
    },
  };
}

/**
 * Get available pipeline channels.
 * @returns {Array<{id: string, name: string, contentType: string, platforms: string[]}>}
 */
export function getAvailableChannels() {
  return [...DEFAULT_CHANNELS];
}

/**
 * Get pipeline run history for a venture.
 * @param {object} supabase
 * @param {string} ventureId
 * @param {number} [limit=10]
 * @returns {Promise<Array>}
 */
export async function getPipelineHistory(supabase, ventureId, limit = 10) {
  const { data, error } = await supabase
    .from('marketing_pipeline_runs')
    .select('*')
    .eq('venture_id', ventureId)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return data || [];
}

// ── Private ─────────────────────────────────────────────

async function recordPipelineRun(supabase, run) {
  await supabase.from('marketing_pipeline_runs').insert({
    venture_id: run.ventureId,
    campaign_id: run.campaignId || null,
    started_at: run.startedAt,
    completed_at: run.completedAt,
    channel_count: run.channelCount,
    total_generated: run.totalGenerated,
    total_published: run.totalPublished,
    total_failed: run.totalFailed,
  });
}
