/**
 * Stage 23 Analysis Step - Marketing Preparation
 * Phase: LAUNCH & LEARN (Stages 23-25)
 * Part of SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-B
 *
 * Consumes Stage 22 release readiness data, generates marketing item
 * payloads via LLM, and creates real marketing SDs via lifecycle-sd-bridge.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-23-marketing-prep
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
import { checkReleaseReadiness } from '../stage-24.js';

// Duplicated from stage-23.js to avoid circular dependency at module-level eval
const MARKETING_ITEM_TYPES = [
  'landing_page', 'social_media_campaign', 'press_release',
  'email_campaign', 'content_blog', 'video_promo', 'ad_creative',
  'product_demo', 'case_study', 'launch_announcement',
];
const MARKETING_PRIORITIES = ['critical', 'high', 'medium', 'low'];

const SYSTEM_PROMPT = `You are EVA's Marketing Preparation Analyst. Given a venture that has passed release readiness (Stage 22), generate marketing material items and SD payloads for content creation.

You MUST output valid JSON with exactly this structure:
{
  "marketing_strategy_summary": "2-4 sentence summary of the marketing strategy for this venture launch",
  "target_audience": "Primary target audience description",
  "marketing_items": [
    {
      "title": "Marketing item title (e.g., 'Product Landing Page')",
      "description": "What this marketing item should contain and accomplish",
      "type": "landing_page|social_media_campaign|press_release|email_campaign|content_blog|video_promo|ad_creative|product_demo|case_study|launch_announcement",
      "priority": "critical|high|medium|low"
    }
  ],
  "sd_bridge_payloads": [
    {
      "title": "SD title for this marketing item",
      "type": "feature",
      "description": "SD description with implementation details",
      "scope": "Files and components involved",
      "rationale": "Why this marketing item is needed for launch"
    }
  ]
}

Rules:
- At least 3 marketing items required, covering at least 3 different types
- Each marketing item must have a corresponding sd_bridge_payload
- sd_bridge_payloads use type "feature" for content creation SDs
- marketing_strategy_summary must be at least 10 characters
- Prioritize items based on launch readiness: landing_page and launch_announcement are typically critical
- If venture has specific product features, tailor marketing items to highlight them
- Include at least one high-priority item for each of: awareness (press/social), conversion (landing page/demo), retention (email/content)`;

/**
 * Generate marketing preparation items from Stage 22 release readiness data.
 *
 * @param {Object} params
 * @param {Object} params.stage22Data - Release readiness (releaseDecision, releaseItems, etc.)
 * @param {Object} [params.stage01Data] - Venture hydration (for product context)
 * @param {Object} [params.stage10Data] - Naming/branding data
 * @param {Object} [params.stage11Data] - GTM strategy data
 * @param {string} [params.ventureName]
 * @param {Object} [params.logger]
 * @returns {Promise<Object>} Marketing items with SD bridge payloads
 */
export async function analyzeStage23({ stage22Data, stage01Data, stage10Data, stage11Data, ventureName, ventureId, supabase, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage23] Starting marketing preparation analysis', { ventureName });

  // Check Stage 22 prerequisite
  const readiness = checkReleaseReadiness({ stage22Data });
  if (!readiness.ready) {
    // L2+ autonomy: auto-proceed despite release readiness not met
    let autonomyOverride = false;
    if (ventureId && supabase) {
      try {
        const { checkAutonomy } = await import('../../autonomy-model.js');
        const autonomy = await checkAutonomy(ventureId, 'stage_gate', { supabase });
        if (autonomy.action === 'auto_approve') {
          logger.log(`[Stage23] Release readiness not met but autonomy=${autonomy.level} — auto-proceeding`);
          autonomyOverride = true;
        }
      } catch { /* fall through to throw */ }
    }
    if (!autonomyOverride) {
      const errorMsg = `Stage 22 release readiness required: ${readiness.reasons.join('; ')}`;
      logger.warn(`[Stage23] ${errorMsg}`);
      throw new Error(errorMsg);
    }
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  // Build context from upstream stages
  const releaseContext = stage22Data.releaseDecision
    ? `Release: ${stage22Data.releaseDecision.decision} — ${stage22Data.releaseDecision.rationale || 'No rationale'}`
    : '';

  const itemsContext = Array.isArray(stage22Data.release_items)
    ? `Release items: ${stage22Data.release_items.map(ri => `${ri.name} (${ri.category || ri.status})`).join(', ')}`
    : '';

  const brandContext = stage10Data?.ventureName
    ? `Brand: ${stage10Data.ventureName}. Tagline: ${stage10Data.tagline || 'N/A'}`
    : '';

  const gtmContext = stage11Data?.channels
    ? `GTM channels: ${JSON.stringify(stage11Data.channels).substring(0, 300)}`
    : '';

  const ventureContext = stage01Data?.problem_statement
    ? `Problem: ${stage01Data.problem_statement}. Solution: ${stage01Data.solution_overview || 'N/A'}`
    : '';

  const userPrompt = `Generate marketing preparation items for this venture's launch.

Venture: ${ventureName || 'Unnamed'}
${releaseContext}
${itemsContext}
${brandContext}
${gtmContext}
${ventureContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Normalize marketing_strategy_summary
  const marketing_strategy_summary = String(parsed.marketing_strategy_summary || 'Marketing strategy pending generation.').substring(0, 1000);

  // Normalize target_audience
  const target_audience = String(parsed.target_audience || 'Target audience pending identification.').substring(0, 500);

  // Normalize marketing items
  let marketing_items = Array.isArray(parsed.marketing_items)
    ? parsed.marketing_items.filter(item => item?.title && item?.description)
    : [];

  if (marketing_items.length < 3) {
    marketing_items = [
      { title: 'Product Landing Page', description: 'Main landing page for product launch', type: 'landing_page', priority: 'critical' },
      { title: 'Launch Announcement', description: 'Official launch announcement for distribution', type: 'launch_announcement', priority: 'critical' },
      { title: 'Social Media Campaign', description: 'Multi-platform social media launch campaign', type: 'social_media_campaign', priority: 'high' },
    ];
  } else {
    marketing_items = marketing_items.map(item => ({
      title: String(item.title).substring(0, 200),
      description: String(item.description).substring(0, 500),
      type: MARKETING_ITEM_TYPES.includes(item.type) ? item.type : 'content_blog',
      priority: MARKETING_PRIORITIES.includes(item.priority) ? item.priority : 'medium',
    }));
  }

  // Normalize SD bridge payloads
  let sd_bridge_payloads = Array.isArray(parsed.sd_bridge_payloads)
    ? parsed.sd_bridge_payloads.filter(p => p?.title)
    : [];

  // If no payloads but items exist, generate payloads from items
  if (sd_bridge_payloads.length === 0 && marketing_items.length > 0) {
    sd_bridge_payloads = marketing_items.map(item => ({
      title: `Create: ${item.title}`,
      type: 'feature',
      description: item.description,
      scope: `Marketing content creation: ${item.type}`,
      rationale: `Required for launch: ${item.title}`,
    }));
  } else {
    sd_bridge_payloads = sd_bridge_payloads.map(p => ({
      title: String(p.title).substring(0, 200),
      type: String(p.type || 'feature'),
      description: String(p.description || '').substring(0, 500),
      scope: String(p.scope || '').substring(0, 300),
      rationale: String(p.rationale || '').substring(0, 300),
    }));
  }

  // Compute derived fields
  const total_marketing_items = marketing_items.length;
  const sds_created_count = 0; // Will be updated after lifecycle-sd-bridge creates SDs
  const marketing_readiness_pct = 0; // Will be updated as marketing SDs are completed

  const latencyMs = Date.now() - startTime;
  logger.log('[Stage23] Marketing preparation complete', {
    itemCount: total_marketing_items,
    payloadCount: sd_bridge_payloads.length,
    latencyMs,
  });

  return {
    marketing_items,
    sd_bridge_payloads,
    marketing_sds: [], // Populated by lifecycle-sd-bridge integration
    marketing_strategy_summary,
    target_audience,
    marketing_readiness_pct,
    total_marketing_items,
    sds_created_count,
    ...(fourBuckets || {}),
    _usage: usage,
    _latencyMs: latencyMs,
  };
}
