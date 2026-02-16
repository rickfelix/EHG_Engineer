/**
 * Stage 12 Analysis Step - Sales Logic Generation
 * Part of SD-EVA-FEAT-TEMPLATES-IDENTITY-001
 *
 * Consumes Stages 1-11 data and generates sales process definition
 * with funnel stages, customer journey, and deal pipeline.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-12-sales-logic
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';

const VALID_SALES_MODELS = ['self-serve', 'inside-sales', 'enterprise', 'hybrid', 'marketplace', 'channel'];
const MIN_FUNNEL_STAGES = 4;
const MIN_JOURNEY_STEPS = 5;
const MIN_DEAL_STAGES = 3;

const SYSTEM_PROMPT = `You are EVA's Sales Logic Engine. Generate a complete sales process definition for a venture.

You MUST output valid JSON with exactly this structure:
{
  "sales_model": "self-serve|inside-sales|enterprise|hybrid|marketplace|channel",
  "sales_cycle_days": 30,
  "deal_stages": [
    {
      "name": "Stage name",
      "description": "Stage description",
      "avg_duration_days": 7,
      "mappedFunnelStage": "Matching funnel stage name"
    }
  ],
  "funnel_stages": [
    {
      "name": "Funnel stage name",
      "metric": "Conversion metric name",
      "target_value": 0.25,
      "conversionRateEstimate": 0.25
    }
  ],
  "customer_journey": [
    {
      "step": "Journey step description",
      "funnel_stage": "Matching funnel stage",
      "touchpoint": "Channel or interaction point"
    }
  ]
}

Rules:
- sales_model must be one of: self-serve, inside-sales, enterprise, hybrid, marketplace, channel
- sales_cycle_days must be >= 1
- Generate at least ${MIN_DEAL_STAGES} deal stages
- Generate at least ${MIN_FUNNEL_STAGES} funnel stages with metrics and target values
- Generate at least ${MIN_JOURNEY_STEPS} customer journey steps mapped to funnel stages
- Each deal stage needs name, description, and mappedFunnelStage referencing a funnel stage name
- Each funnel stage needs name, metric, target_value (numeric, >= 0), and conversionRateEstimate (0-1)
- conversionRateEstimate represents the estimated conversion rate at each funnel stage
- Each journey step needs step description, funnel_stage reference, and touchpoint
- Use upstream GTM and financial data to inform the sales model choice`;

/**
 * Generate sales logic from upstream stage data.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data - Stage 1 Draft Idea
 * @param {Object} [params.stage5Data] - Stage 5 financial model
 * @param {Object} [params.stage7Data] - Stage 7 pricing strategy
 * @param {Object} [params.stage10Data] - Stage 10 naming/brand
 * @param {Object} [params.stage11Data] - Stage 11 GTM
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Sales logic definition
 */
export async function analyzeStage12({ stage1Data, stage5Data, stage7Data, stage10Data, stage11Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage12] Starting analysis', { ventureName });
  if (!stage1Data?.description) {
    throw new Error('Stage 12 sales logic requires Stage 1 data with description');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const brandContext = stage10Data?.brandGenome
    ? `Brand: ${stage10Data.brandGenome.archetype}, audience: ${stage10Data.brandGenome.audience}`
    : '';

  const gtmContext = stage11Data
    ? `GTM: ${stage11Data.tierCount || stage11Data.tiers?.length || 0} tiers, ${stage11Data.channelCount || stage11Data.channels?.length || 0} channels, avg CAC $${stage11Data.avgCac || stage11Data.avg_cac || 'N/A'}`
    : '';

  const financialContext = stage5Data
    ? `Financial: Year 1 Revenue $${stage5Data.year1?.revenue || 'N/A'}`
    : '';

  const pricingContext = stage7Data
    ? `Pricing: ${stage7Data.pricingModel || 'N/A'}, ARPA $${stage7Data.unitEconomics?.arpa || 'N/A'}`
    : '';

  const userPrompt = `Generate a sales process definition for this venture.

Venture: ${ventureName || 'Unnamed'}
Description: ${stage1Data.description}
Target Market: ${stage1Data.targetMarket || 'N/A'}
${brandContext}
${gtmContext}
${financialContext}
${pricingContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt);
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Normalize sales model
  const sales_model = VALID_SALES_MODELS.includes(parsed.sales_model)
    ? parsed.sales_model
    : 'hybrid';

  // Normalize sales cycle
  const sales_cycle_days = typeof parsed.sales_cycle_days === 'number' && parsed.sales_cycle_days >= 1
    ? Math.round(parsed.sales_cycle_days)
    : 30;

  // Normalize deal stages
  let dealStages = Array.isArray(parsed.deal_stages) ? parsed.deal_stages : [];
  if (dealStages.length < MIN_DEAL_STAGES) {
    const defaults = [
      { name: 'Qualification', description: 'Initial lead qualification', avg_duration_days: 3 },
      { name: 'Discovery', description: 'Needs assessment and demo', avg_duration_days: 7 },
      { name: 'Proposal', description: 'Solution proposal and pricing', avg_duration_days: 5 },
      { name: 'Negotiation', description: 'Terms negotiation and close', avg_duration_days: 7 },
    ];
    while (dealStages.length < MIN_DEAL_STAGES) {
      dealStages.push(defaults[dealStages.length] || { name: `Stage ${dealStages.length + 1}`, description: 'TBD', avg_duration_days: 5 });
    }
  }
  dealStages = dealStages.map((ds, i) => ({
    name: String(ds.name || `Stage ${i + 1}`).substring(0, 200),
    description: String(ds.description || 'TBD').substring(0, 500),
    avg_duration_days: typeof ds.avg_duration_days === 'number' && ds.avg_duration_days >= 0 ? ds.avg_duration_days : 5,
    mappedFunnelStage: String(ds.mappedFunnelStage || '').substring(0, 200) || null,
  }));

  // Normalize funnel stages
  let funnelStages = Array.isArray(parsed.funnel_stages) ? parsed.funnel_stages : [];
  if (funnelStages.length < MIN_FUNNEL_STAGES) {
    const defaults = [
      { name: 'Awareness', metric: 'Website visitors', target_value: 10000 },
      { name: 'Interest', metric: 'Signup rate', target_value: 0.05 },
      { name: 'Consideration', metric: 'Trial starts', target_value: 500 },
      { name: 'Purchase', metric: 'Conversion rate', target_value: 0.02 },
    ];
    while (funnelStages.length < MIN_FUNNEL_STAGES) {
      funnelStages.push(defaults[funnelStages.length] || { name: `Stage ${funnelStages.length + 1}`, metric: 'TBD', target_value: 0 });
    }
  }
  funnelStages = funnelStages.map((fs, i) => ({
    name: String(fs.name || `Stage ${i + 1}`).substring(0, 200),
    metric: String(fs.metric || 'TBD').substring(0, 200),
    target_value: typeof fs.target_value === 'number' && fs.target_value >= 0 ? fs.target_value : 0,
    conversionRateEstimate: typeof fs.conversionRateEstimate === 'number' && fs.conversionRateEstimate >= 0 && fs.conversionRateEstimate <= 1
      ? Math.round(fs.conversionRateEstimate * 10000) / 10000
      : null,
  }));

  // Normalize customer journey
  let customerJourney = Array.isArray(parsed.customer_journey) ? parsed.customer_journey : [];
  if (customerJourney.length < MIN_JOURNEY_STEPS) {
    const defaults = [
      { step: 'Discovers product via search/social', funnel_stage: 'Awareness', touchpoint: 'Website' },
      { step: 'Reads content and explores features', funnel_stage: 'Interest', touchpoint: 'Blog/Landing page' },
      { step: 'Signs up for free trial', funnel_stage: 'Consideration', touchpoint: 'Sign-up form' },
      { step: 'Engages with product features', funnel_stage: 'Consideration', touchpoint: 'Product' },
      { step: 'Converts to paid plan', funnel_stage: 'Purchase', touchpoint: 'Checkout' },
    ];
    while (customerJourney.length < MIN_JOURNEY_STEPS) {
      customerJourney.push(defaults[customerJourney.length] || { step: `Step ${customerJourney.length + 1}`, funnel_stage: 'TBD', touchpoint: 'TBD' });
    }
  }
  customerJourney = customerJourney.map(cj => ({
    step: String(cj.step || 'TBD').substring(0, 300),
    funnel_stage: String(cj.funnel_stage || 'TBD').substring(0, 200),
    touchpoint: String(cj.touchpoint || 'TBD').substring(0, 200),
  }));

  // Back-link: validate mappedFunnelStage references valid funnel stage names
  const funnelNames = funnelStages.map(fs => fs.name);
  dealStages = dealStages.map(ds => ({
    ...ds,
    mappedFunnelStage: ds.mappedFunnelStage && funnelNames.includes(ds.mappedFunnelStage)
      ? ds.mappedFunnelStage
      : funnelNames[0] || null,
  }));

  // Economy check: compute pipeline metrics for Reality Gate
  const totalPipelineValue = funnelStages.reduce((sum, fs) => sum + fs.target_value, 0);
  const avgConversionRate = (() => {
    const rates = funnelStages.filter(fs => fs.conversionRateEstimate !== null);
    return rates.length > 0
      ? Math.round(rates.reduce((sum, fs) => sum + fs.conversionRateEstimate, 0) / rates.length * 10000) / 10000
      : null;
  })();

  logger.log('[Stage12] Analysis complete', { duration: Date.now() - startTime });
  return {
    sales_model,
    sales_cycle_days,
    deal_stages: dealStages,
    funnel_stages: funnelStages,
    customer_journey: customerJourney,
    totalDealStages: dealStages.length,
    totalFunnelStages: funnelStages.length,
    totalJourneySteps: customerJourney.length,
    economyCheck: {
      totalPipelineValue,
      avgConversionRate,
      pricingAvailable: !!stage7Data,
    },
    fourBuckets, usage,
  };
}


export { VALID_SALES_MODELS, MIN_FUNNEL_STAGES, MIN_JOURNEY_STEPS, MIN_DEAL_STAGES };
