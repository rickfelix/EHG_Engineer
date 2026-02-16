/**
 * Stage 11 Analysis Step - Go-To-Market Strategy Generation
 * Part of SD-EVA-FEAT-TEMPLATES-IDENTITY-001
 *
 * Consumes Stages 1-10 data and generates GTM strategy with
 * market tiers, acquisition channels, and launch timeline.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-11-gtm
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
import { isSearchEnabled, searchBatch, formatResultsForPrompt } from '../../utils/web-search.js';
import { runTournament } from '../../crews/tournament-orchestrator.js';

const REQUIRED_TIERS = 3;
const REQUIRED_CHANNELS = 8;
const CHANNEL_TYPES = ['paid', 'organic', 'earned', 'owned'];

const SYSTEM_PROMPT = `You are EVA's Go-To-Market Strategy Engine. Generate a complete GTM strategy for a venture.

You MUST output valid JSON with exactly this structure:
{
  "tiers": [
    {
      "name": "Tier name",
      "description": "Market tier description",
      "tam": 1000000,
      "sam": 500000,
      "som": 50000,
      "persona": "Ideal customer persona for this tier (job title, company size, pain level)",
      "painPoints": ["Specific pain point 1", "Specific pain point 2"]
    }
  ],
  "channels": [
    {
      "name": "Channel name",
      "monthly_budget": 5000,
      "expected_cac": 50,
      "primary_kpi": "Signups per month",
      "channelType": "paid|organic|earned|owned",
      "primaryTier": "Tier name this channel primarily targets"
    }
  ],
  "launch_timeline": [
    {
      "milestone": "Milestone description",
      "date": "YYYY-MM-DD",
      "owner": "Team or role"
    }
  ]
}

Rules:
- Generate EXACTLY ${REQUIRED_TIERS} market tiers (Tier 1 = most accessible, Tier 3 = aspirational)
- Generate EXACTLY ${REQUIRED_CHANNELS} acquisition channels
- Each tier needs name, description, TAM/SAM/SOM estimates, persona, and painPoints (>= 1)
- Each channel needs name, monthly_budget (>= 0), expected_cac (>= 0), primary_kpi, channelType, primaryTier
- channelType must be one of: paid, organic, earned, owned
- primaryTier must reference one of the tier names
- Channels with monthly_budget = 0 are valid (BACKLOG items to activate later)
- Launch timeline needs at least 3 milestones with dates
- Use upstream financial and market data to inform budget allocation
- Channels should include a mix of paid and organic strategies`;

/**
 * Generate GTM strategy from upstream stage data.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data - Stage 1 Draft Idea
 * @param {Object} [params.stage5Data] - Stage 5 financial model
 * @param {Object} [params.stage10Data] - Stage 10 naming/brand
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} GTM strategy
 */
export async function analyzeStage11({ stage1Data, stage5Data, stage10Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage11] Starting analysis', { ventureName });
  if (!stage1Data?.description) {
    throw new Error('Stage 11 GTM requires Stage 1 data with description');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const brandContext = stage10Data?.brandGenome
    ? `Brand: ${stage10Data.brandGenome.archetype} archetype, targeting ${stage10Data.brandGenome.audience}`
    : '';

  const financialContext = stage5Data
    ? `Financial: Initial Investment $${stage5Data.initialInvestment || 'N/A'}, Year 1 Revenue $${stage5Data.year1?.revenue || 'N/A'}`
    : '';

  // Web-grounded search for GTM intelligence
  let webContext = '';
  if (isSearchEnabled()) {
    const queries = [
      `${stage1Data.targetMarket || ventureName} go to market strategy channels 2024 2025`,
      `${stage1Data.targetMarket || 'SaaS'} customer acquisition channels CAC benchmarks`,
      `${stage1Data.description?.substring(0, 80)} market entry strategy`,
    ];
    logger.log('[Stage11] Running web search', { queryCount: queries.length });
    const webResults = await searchBatch(queries, { logger });
    webContext = formatResultsForPrompt(webResults, 'GTM Intelligence Research');
  }

  const userPrompt = `Generate a Go-To-Market strategy for this venture.

Venture: ${ventureName || 'Unnamed'}
Description: ${stage1Data.description}
Target Market: ${stage1Data.targetMarket || 'N/A'}
Problem: ${stage1Data.problemStatement || 'N/A'}
${brandContext}
${financialContext}
${webContext}
Output ONLY valid JSON.`;

  // SD-MAN-ORCH-EVA-INTELLIGENCE-LAYER-001-E: Tournament mode
  const tournamentEnabled = process.env.CREW_TOURNAMENT_ENABLED === 'true';
  let parsed, fourBuckets, tournamentMeta = null;

  if (tournamentEnabled) {
    logger.log('[Stage11] Tournament mode enabled');
    const { result, tournament } = await runTournament({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      context: { description: stage1Data.description, targetMarket: stage1Data.targetMarket },
      options: { logger },
    });
    tournamentMeta = tournament;

    if (result) {
      parsed = result;
      fourBuckets = result.fourBuckets || parseFourBuckets(result, { logger });
      logger.log('[Stage11] Tournament winner selected', { score: tournament.scores?.[tournament.winnerIndex]?.total });
    } else {
      logger.log('[Stage11] Tournament fallback — using single generation');
      const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt);
      parsed = parseJSON(response);
      fourBuckets = parseFourBuckets(parsed, { logger });
    }
  } else {
    const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt);
    parsed = parseJSON(response);
    fourBuckets = parseFourBuckets(parsed, { logger });
  }

  // Normalize tiers (exactly 3)
  let tiers = Array.isArray(parsed.tiers) ? parsed.tiers : [];
  while (tiers.length < REQUIRED_TIERS) {
    tiers.push({
      name: `Tier ${tiers.length + 1}`,
      description: 'TBD',
      tam: 0,
      sam: 0,
      som: 0,
    });
  }
  tiers = tiers.slice(0, REQUIRED_TIERS).map((t, i) => ({
    name: String(t.name || `Tier ${i + 1}`).substring(0, 200),
    description: String(t.description || 'TBD').substring(0, 500),
    tam: typeof t.tam === 'number' && t.tam >= 0 ? t.tam : 0,
    sam: typeof t.sam === 'number' && t.sam >= 0 ? t.sam : 0,
    som: typeof t.som === 'number' && t.som >= 0 ? t.som : 0,
    persona: String(t.persona || '').substring(0, 500) || null,
    painPoints: Array.isArray(t.painPoints) && t.painPoints.length > 0
      ? t.painPoints.map(p => String(p).substring(0, 300))
      : [],
  }));
  const tierNames = tiers.map(t => t.name);

  // Normalize channels (exactly 8)
  let channels = Array.isArray(parsed.channels) ? parsed.channels : [];
  const defaultChannelNames = [
    'Organic Search', 'Paid Search', 'Social Media', 'Content Marketing',
    'Email Marketing', 'Partnerships', 'Events', 'Direct Sales',
  ];
  while (channels.length < REQUIRED_CHANNELS) {
    channels.push({
      name: defaultChannelNames[channels.length] || `Channel ${channels.length + 1}`,
      monthly_budget: 0,
      expected_cac: 0,
      primary_kpi: 'TBD',
    });
  }
  channels = channels.slice(0, REQUIRED_CHANNELS).map((ch, i) => {
    const budget = typeof ch.monthly_budget === 'number' && ch.monthly_budget >= 0 ? ch.monthly_budget : 0;
    const primaryTier = tierNames.includes(ch.primaryTier)
      ? ch.primaryTier
      : tierNames[0] || 'Tier 1';
    return {
      name: String(ch.name || defaultChannelNames[i] || `Channel ${i + 1}`).substring(0, 200),
      monthly_budget: budget,
      expected_cac: typeof ch.expected_cac === 'number' && ch.expected_cac >= 0 ? ch.expected_cac : 0,
      primary_kpi: String(ch.primary_kpi || 'TBD').substring(0, 200),
      channelType: CHANNEL_TYPES.includes(ch.channelType) ? ch.channelType : 'organic',
      primaryTier,
      status: budget === 0 ? 'BACKLOG' : 'ACTIVE',
    };
  });

  // Normalize launch timeline
  let launchTimeline = Array.isArray(parsed.launch_timeline) ? parsed.launch_timeline : [];
  if (launchTimeline.length === 0) {
    launchTimeline = [
      { milestone: 'Soft launch', date: '', owner: 'Founder' },
      { milestone: 'Public launch', date: '', owner: 'Founder' },
      { milestone: 'Growth phase', date: '', owner: 'Marketing' },
    ];
  }
  launchTimeline = launchTimeline.map(m => ({
    milestone: String(m.milestone || 'TBD').substring(0, 200),
    date: String(m.date || ''),
    owner: String(m.owner || '').substring(0, 100),
  }));

  const totalMonthlyBudget = channels.reduce((sum, ch) => sum + ch.monthly_budget, 0);
  const cacValues = channels.filter(ch => ch.expected_cac > 0);
  const avgCac = cacValues.length > 0
    ? Math.round(cacValues.reduce((sum, ch) => sum + ch.expected_cac, 0) / cacValues.length * 100) / 100
    : 0;

  const activeChannels = channels.filter(ch => ch.status === 'ACTIVE');
  const backlogChannels = channels.filter(ch => ch.status === 'BACKLOG');

  logger.log('[Stage11] Analysis complete', { duration: Date.now() - startTime });
  return {
    tiers,
    channels,
    launch_timeline: launchTimeline,
    totalMonthlyBudget,
    avgCac,
    tierCount: tiers.length,
    channelCount: channels.length,
    activeChannelCount: activeChannels.length,
    backlogChannelCount: backlogChannels.length,
    fourBuckets,
    ...(tournamentMeta ? { tournament: tournamentMeta } : {}),
  };
}


export { REQUIRED_TIERS, REQUIRED_CHANNELS, CHANNEL_TYPES };
