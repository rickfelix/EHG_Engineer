/**
 * Stage 22 Analysis Step — Distribution Setup
 * Phase: BUILD & MARKET (Stages 18-22)
 * SD: SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-D
 *
 * Configures distribution channels from GTM strategy (S12) and persona
 * demographics (S10). Generates platform-specific ad copy with targeting.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-22-distribution-setup
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';

const CHANNELS = ['app_store', 'google_ads', 'facebook_instagram', 'twitter_x', 'email', 'blog_seo'];

// 2026-04-22: LLM generates channel configuration and ad copy from GTM + persona data
const SYSTEM_PROMPT = `You are EVA's Distribution Planner. Configure marketing distribution channels and generate ad copy based on GTM strategy and target personas.

Output valid JSON:
{
  "channels": [
    {
      "channel": "app_store|google_ads|facebook_instagram|twitter_x|email|blog_seo",
      "status": "active|pending|skipped",
      "reason": "Why this channel is active or skipped",
      "ad_copy": {
        "headline": "Ad headline for this channel",
        "body": "Ad body text (channel-appropriate length)",
        "cta": "Call to action text"
      },
      "targeting": {
        "audience": "Target audience description",
        "demographics": "Age, location, interests",
        "keywords": ["keyword1", "keyword2"]
      }
    }
  ],
  "email_sequences": [
    {
      "sequence_name": "welcome|onboarding|reengagement",
      "emails_count": 3,
      "cadence": "Day 0, Day 3, Day 7",
      "preview": "Brief description of the sequence"
    }
  ],
  "budget_allocation": {
    "total_monthly": "Recommended monthly budget",
    "by_channel": { "google_ads": "40%", "facebook_instagram": "35%", "twitter_x": "15%", "blog_seo": "10%" }
  }
}

Rules:
- Configure at least 3 channels as active
- Each active channel must have ad copy and targeting
- Email sequences should reference the S18 copy (welcome, onboarding, re-engagement)
- Budget allocation based on GTM strategy channel priorities
- Targeting should use persona demographics (age, interests, pain points)`;

export async function analyzeStage22Distribution(params) {
  const { stage12Data, stage10Data, stage18Data, stage7Data, ventureName, logger = console } = params;

  logger.info?.(`[S22-Distribution] Configuring channels for ${ventureName || 'unknown'}`);

  const context = {
    gtm_strategy: stage12Data || {},
    personas: stage10Data || {},
    marketing_copy: stage18Data || {},
    pricing: stage7Data || {},
    venture_name: ventureName,
  };

  let result;
  let usage = {};

  try {
    const client = getLLMClient();
    const response = await client.complete(SYSTEM_PROMPT, `Configure distribution for: ${ventureName}\n\nContext:\n${JSON.stringify(context, null, 2)}`);
    const parsed = parseJSON(response);
    usage = extractUsage(response) || {};
    result = parsed?.channels ? parsed : buildFallback(ventureName);
  } catch (err) {
    logger.warn('[S22-Distribution] LLM error, using fallback:', err.message);
    result = buildFallback(ventureName);
  }

  const activeChannels = (result.channels || []).filter(c => c.status === 'active');

  return {
    ...result,
    channels: result.channels || [],
    email_sequences: result.email_sequences || [],
    budget_allocation: result.budget_allocation || {},
    total_channels: (result.channels || []).length,
    active_channels: activeChannels.length,
    channels_with_copy: activeChannels.filter(c => c.ad_copy?.headline).length,
    usage,
  };
}

function buildFallback(ventureName) {
  return {
    channels: CHANNELS.map(ch => ({
      channel: ch,
      status: ['app_store', 'google_ads', 'email'].includes(ch) ? 'active' : 'pending',
      reason: ch === 'app_store' ? 'Primary distribution' : 'Awaiting GTM data',
      ad_copy: { headline: `Try ${ventureName}`, body: `[Fallback — regenerate with GTM data]`, cta: 'Get Started' },
      targeting: { audience: 'Target audience', demographics: 'TBD from persona data', keywords: [ventureName?.toLowerCase() || 'product'] },
    })),
    email_sequences: [
      { sequence_name: 'welcome', emails_count: 3, cadence: 'Day 0, Day 1, Day 3', preview: 'Welcome + quick start' },
      { sequence_name: 'onboarding', emails_count: 3, cadence: 'Day 3, Day 5, Day 7', preview: 'Feature highlights' },
      { sequence_name: 'reengagement', emails_count: 2, cadence: 'Day 14, Day 30', preview: 'Come back + incentive' },
    ],
    budget_allocation: { total_monthly: 'TBD', by_channel: { google_ads: '40%', facebook_instagram: '35%', email: '15%', blog_seo: '10%' } },
  };
}

export { CHANNELS };
