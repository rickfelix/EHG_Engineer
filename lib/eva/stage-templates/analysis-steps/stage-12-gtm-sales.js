/**
 * Stage 12 Analysis Step - GTM & Sales Strategy
 * Part of SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-A
 *
 * Combined go-to-market and sales strategy generation.
 * Consumes Stage 10 personas/brand and Stage 11 naming/visual identity
 * to produce market tiers, channels, sales model, funnel, and journey.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-12-gtm-sales
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
import { isSearchEnabled, searchBatch, formatResultsForPrompt } from '../../utils/web-search.js';
// evaluateRealityGate is a hoisted function declaration, safe for circular dependency import.
// stage-12.js imports analyzeStage12 from this file; this file imports evaluateRealityGate back.
import { evaluateRealityGate } from '../stage-12.js';
import { sanitizeForPrompt } from '../../utils/sanitize-for-prompt.js';
import { writeArtifact } from '../../artifact-persistence-service.js';

// Duplicated from stage-12.js to avoid circular dependency at module-level evaluation.
const SALES_MODELS = ['self-serve', 'inside-sales', 'enterprise', 'hybrid', 'marketplace', 'channel'];
const CHANNEL_TYPES = ['paid', 'organic', 'earned', 'owned'];
const REQUIRED_TIERS = 3;
const REQUIRED_CHANNELS = 8;
const MIN_DEAL_STAGES = 3;
const MIN_FUNNEL_STAGES = 4;
const MIN_JOURNEY_STEPS = 5;

const SYSTEM_PROMPT = `You are EVA's GTM & Sales Strategy Engine. Generate a complete go-to-market and sales strategy for a venture, grounded in its customer personas and brand identity.

You MUST output valid JSON with exactly this structure:
{
  "marketTiers": [
    {
      "name": "Tier name",
      "description": "Market tier description",
      "persona": "Primary persona this tier targets (from Stage 10)",
      "painPoints": ["Pain point 1", "Pain point 2"],
      "tam": 1000000,
      "sam": 500000,
      "som": 50000
    }
  ],
  "channels": [
    {
      "name": "Channel name",
      "channelType": "paid|organic|earned|owned",
      "primaryTier": "Tier name this channel targets",
      "monthly_budget": 5000,
      "expected_cac": 50,
      "primary_kpi": "Key performance indicator"
    }
  ],
  "salesModel": "self-serve|inside-sales|enterprise|hybrid|marketplace|channel",
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
      "target_value": 10000,
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
- Generate EXACTLY ${REQUIRED_TIERS} market tiers (Tier 1 = most accessible, Tier 3 = aspirational)
- Generate EXACTLY ${REQUIRED_CHANNELS} acquisition channels
- Each tier needs name, description, persona (reference Stage 10 personas by name), painPoints, TAM/SAM/SOM
- Each channel needs name, channelType (paid|organic|earned|owned), primaryTier, monthly_budget (>= 0), expected_cac (>= 0), primary_kpi
- salesModel must be one of: self-serve, inside-sales, enterprise, hybrid, marketplace, channel
- sales_cycle_days must be >= 1
- Generate at least ${MIN_DEAL_STAGES} deal stages with mappedFunnelStage references
- Generate at least ${MIN_FUNNEL_STAGES} funnel stages with metrics, target values, and conversionRateEstimate (0-1)
- Generate at least ${MIN_JOURNEY_STEPS} customer journey steps mapped to funnel stages
- Use upstream persona data and brand identity to inform tier definitions
- Align channels to tiers — each channel should target a specific tier
- Sales model should match the venture's pricing and target audience`;

/**
 * Generate combined GTM & sales strategy from upstream stage data.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data - Stage 1 Draft Idea (required)
 * @param {Object} [params.stage5Data] - Stage 5 financial model
 * @param {Object} [params.stage7Data] - Stage 7 pricing strategy
 * @param {Object} params.stage10Data - Stage 10 customer & brand (required)
 * @param {Object} [params.stage11Data] - Stage 11 naming & visual identity
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} GTM & sales strategy
 */
export async function analyzeStage12({ stage1Data, stage5Data, stage7Data, stage10Data, stage11Data, ventureName, ventureId, supabase, visionKey = null, planKey = null, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage12] Starting GTM & sales strategy analysis', { ventureName });

  if (!stage1Data?.description) {
    throw new Error('Stage 12 requires Stage 1 data with description');
  }
  if (!stage10Data?.customerPersonas) {
    throw new Error('Stage 12 requires Stage 10 data with customerPersonas');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  // Build persona context from Stage 10
  const personaContext = stage10Data.customerPersonas
    .map(p => `- ${p.name}: Goals: ${(p.goals || []).join(', ')}. Pain points: ${(p.painPoints || []).join(', ')}`)
    .join('\n');

  const brandContext = stage10Data.brandGenome
    ? `Brand: ${stage10Data.brandGenome.archetype} archetype, targeting ${stage10Data.brandGenome.audience}\nDifferentiators: ${(stage10Data.brandGenome.differentiators || []).join(', ')}`
    : '';

  const namingContext = stage11Data?.decision?.selectedName
    ? `Selected Name: ${stage11Data.decision.selectedName}`
    : '';

  const financialContext = stage5Data
    ? `Financial: Initial Investment $${stage5Data.initialInvestment || 'N/A'}, Year 1 Revenue $${stage5Data.year1?.revenue || 'N/A'}`
    : '';

  const pricingContext = stage7Data
    ? `Pricing: ${stage7Data.pricing_model || 'N/A'}, ARPA $${stage7Data.arpa || 'N/A'}`
    : '';

  // Web-grounded search for GTM intelligence
  let webContext = '';
  if (isSearchEnabled()) {
    const queries = [
      `${sanitizeForPrompt(stage1Data.targetMarket || ventureName)} go to market strategy channels ${new Date().getFullYear()}`,
      `${sanitizeForPrompt(stage1Data.targetMarket || 'SaaS')} customer acquisition channels CAC benchmarks`,
      `${sanitizeForPrompt(stage1Data.description?.substring(0, 80))} sales model strategy`,
    ];
    logger.log('[Stage12] Running web search', { queryCount: queries.length });
    const webResults = await searchBatch(queries, { logger });
    webContext = formatResultsForPrompt(webResults, 'GTM & Sales Intelligence Research');
  }

  const userPrompt = `Generate a GTM & sales strategy for this venture, grounded in the customer personas.

Venture: ${ventureName || 'Unnamed'}
Description: ${sanitizeForPrompt(stage1Data.description)}
Target Market: ${sanitizeForPrompt(stage1Data.targetMarket || 'N/A')}
Problem: ${sanitizeForPrompt(stage1Data.problemStatement || 'N/A')}

Customer Personas (from Stage 10):
${personaContext}

${brandContext}
${namingContext}
${financialContext}
${pricingContext}
${webContext}

IMPORTANT: Market tiers MUST reference Stage 10 personas by name. Channels should target specific tiers.

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  let llmFallbackCount = 0;

  // --- Normalize market tiers (exactly 3) ---
  let marketTiers = Array.isArray(parsed.marketTiers) ? parsed.marketTiers : [];
  if (marketTiers.length < REQUIRED_TIERS) llmFallbackCount++;
  while (marketTiers.length < REQUIRED_TIERS) {
    marketTiers.push({
      name: `Tier ${marketTiers.length + 1}`,
      description: 'TBD',
      tam: 0, sam: 0, som: 0,
    });
  }
  marketTiers = marketTiers.slice(0, REQUIRED_TIERS).map((t, i) => ({
    name: String(t.name || `Tier ${i + 1}`).substring(0, 200),
    description: String(t.description || 'TBD').substring(0, 500),
    persona: String(t.persona || '').substring(0, 500) || null,
    painPoints: Array.isArray(t.painPoints) && t.painPoints.length > 0
      ? t.painPoints.map(p => String(p).substring(0, 300))
      : [],
    tam: typeof t.tam === 'number' && t.tam >= 0 ? t.tam : 0,
    sam: typeof t.sam === 'number' && t.sam >= 0 ? t.sam : 0,
    som: typeof t.som === 'number' && t.som >= 0 ? t.som : 0,
  }));
  const tierNames = marketTiers.map(t => t.name);

  // --- Normalize channels (exactly 8) ---
  let channels = Array.isArray(parsed.channels) ? parsed.channels : [];
  if (channels.length < REQUIRED_CHANNELS) llmFallbackCount++;
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
    const primaryTier = tierNames.includes(ch.primaryTier)
      ? ch.primaryTier
      : tierNames[0] || 'Tier 1';
    return {
      name: String(ch.name || defaultChannelNames[i] || `Channel ${i + 1}`).substring(0, 200),
      channelType: CHANNEL_TYPES.includes(ch.channelType) ? ch.channelType : 'organic',
      primaryTier,
      monthly_budget: typeof ch.monthly_budget === 'number' && ch.monthly_budget >= 0 ? ch.monthly_budget : 0,
      expected_cac: typeof ch.expected_cac === 'number' && ch.expected_cac >= 0 ? ch.expected_cac : 0,
      primary_kpi: String(ch.primary_kpi || 'TBD').substring(0, 200),
    };
  });

  // --- Normalize sales model ---
  if (!SALES_MODELS.includes(parsed.salesModel)) llmFallbackCount++;
  const salesModel = SALES_MODELS.includes(parsed.salesModel)
    ? parsed.salesModel
    : 'hybrid';

  // --- Normalize sales cycle days ---
  if (typeof parsed.sales_cycle_days !== 'number' || parsed.sales_cycle_days < 1) llmFallbackCount++;
  const sales_cycle_days = typeof parsed.sales_cycle_days === 'number' && parsed.sales_cycle_days >= 1
    ? Math.round(parsed.sales_cycle_days)
    : 30;

  // --- Normalize deal stages (min 3) ---
  let deal_stages = Array.isArray(parsed.deal_stages) ? parsed.deal_stages : [];
  if (deal_stages.length < MIN_DEAL_STAGES) {
    llmFallbackCount++;
    const defaults = [
      { name: 'Qualification', description: 'Initial lead qualification', avg_duration_days: 3 },
      { name: 'Discovery', description: 'Needs assessment and demo', avg_duration_days: 7 },
      { name: 'Proposal', description: 'Solution proposal and pricing', avg_duration_days: 5 },
      { name: 'Negotiation', description: 'Terms negotiation and close', avg_duration_days: 7 },
    ];
    while (deal_stages.length < MIN_DEAL_STAGES) {
      deal_stages.push(defaults[deal_stages.length] || { name: `Stage ${deal_stages.length + 1}`, description: 'TBD', avg_duration_days: 5 });
    }
  }
  deal_stages = deal_stages.map((ds, i) => ({
    name: String(ds.name || `Stage ${i + 1}`).substring(0, 200),
    description: String(ds.description || 'TBD').substring(0, 500),
    avg_duration_days: typeof ds.avg_duration_days === 'number' && ds.avg_duration_days >= 0 ? ds.avg_duration_days : 5,
    mappedFunnelStage: String(ds.mappedFunnelStage || '').substring(0, 200) || null,
  }));

  // --- Normalize funnel stages (min 4) ---
  let funnel_stages = Array.isArray(parsed.funnel_stages) ? parsed.funnel_stages : [];
  if (funnel_stages.length < MIN_FUNNEL_STAGES) {
    llmFallbackCount++;
    const defaults = [
      { name: 'Awareness', metric: 'Website visitors', target_value: 10000 },
      { name: 'Interest', metric: 'Signup rate', target_value: 500 },
      { name: 'Consideration', metric: 'Trial starts', target_value: 100 },
      { name: 'Purchase', metric: 'Paid conversions', target_value: 20 },
    ];
    while (funnel_stages.length < MIN_FUNNEL_STAGES) {
      funnel_stages.push(defaults[funnel_stages.length] || { name: `Stage ${funnel_stages.length + 1}`, metric: 'TBD', target_value: 0 });
    }
  }
  funnel_stages = funnel_stages.map((fs, i) => ({
    name: String(fs.name || `Stage ${i + 1}`).substring(0, 200),
    metric: String(fs.metric || 'TBD').substring(0, 200),
    target_value: typeof fs.target_value === 'number' && fs.target_value >= 0 ? fs.target_value : 0,
    conversionRateEstimate: typeof fs.conversionRateEstimate === 'number' && fs.conversionRateEstimate >= 0 && fs.conversionRateEstimate <= 1
      ? Math.round(fs.conversionRateEstimate * 10000) / 10000
      : null,
  }));

  // --- Normalize customer journey (min 5) ---
  let customer_journey = Array.isArray(parsed.customer_journey) ? parsed.customer_journey : [];
  if (customer_journey.length < MIN_JOURNEY_STEPS) {
    llmFallbackCount++;
    const defaults = [
      { step: 'Discovers product via search/social', funnel_stage: 'Awareness', touchpoint: 'Website' },
      { step: 'Reads content and explores features', funnel_stage: 'Interest', touchpoint: 'Blog/Landing page' },
      { step: 'Signs up for free trial', funnel_stage: 'Consideration', touchpoint: 'Sign-up form' },
      { step: 'Engages with product features', funnel_stage: 'Consideration', touchpoint: 'Product' },
      { step: 'Converts to paid plan', funnel_stage: 'Purchase', touchpoint: 'Checkout' },
    ];
    while (customer_journey.length < MIN_JOURNEY_STEPS) {
      customer_journey.push(defaults[customer_journey.length] || { step: `Step ${customer_journey.length + 1}`, funnel_stage: 'TBD', touchpoint: 'TBD' });
    }
  }
  customer_journey = customer_journey.map(cj => ({
    step: String(cj.step || 'TBD').substring(0, 300),
    funnel_stage: String(cj.funnel_stage || 'TBD').substring(0, 200),
    touchpoint: String(cj.touchpoint || 'TBD').substring(0, 200),
  }));

  // --- Back-link deal stages to valid funnel stage names ---
  const funnelNames = funnel_stages.map(fs => fs.name);
  deal_stages = deal_stages.map(ds => ({
    ...ds,
    mappedFunnelStage: ds.mappedFunnelStage && funnelNames.includes(ds.mappedFunnelStage)
      ? ds.mappedFunnelStage
      : funnelNames[0] || null,
  }));

  // --- Compute derived metrics ---
  const total_monthly_budget = channels.reduce((sum, ch) => sum + ch.monthly_budget, 0);
  const cacValues = channels.filter(ch => ch.expected_cac > 0);
  const avg_cac = cacValues.length > 0
    ? Math.round(cacValues.reduce((sum, ch) => sum + ch.expected_cac, 0) / cacValues.length * 100) / 100
    : 0;

  // Economy check: pipeline metrics for Reality Gate
  const totalPipelineValue = funnel_stages.reduce((sum, fs) => sum + fs.target_value, 0);
  const avgConversionRate = (() => {
    const rates = funnel_stages.filter(fs => fs.conversionRateEstimate !== null);
    return rates.length > 0
      ? Math.round(rates.reduce((sum, fs) => sum + fs.conversionRateEstimate, 0) / rates.length * 10000) / 10000
      : null;
  })();

  const economyCheck = {
    totalPipelineValue,
    avgConversionRate,
    pricingAvailable: !!stage7Data,
  };

  // --- Evaluate Phase 3→4 Reality Gate (local gate) ---
  const reality_gate = evaluateRealityGate({
    stage10: stage10Data,
    stage11: stage11Data,
    stage12: {
      marketTiers,
      channels,
      deal_stages,
      funnel_stages,
      customer_journey,
      economyCheck,
    },
  });

  if (llmFallbackCount > 0) {
    logger.warn('[Stage12] LLM fallback fields detected', { llmFallbackCount });
  }

  logger.log('[Stage12] Analysis complete', {
    duration: Date.now() - startTime,
    tierCount: marketTiers.length,
    channelCount: channels.length,
    realityGatePass: reality_gate.pass,
  });

  // SD-LEO-ORCH-PIPELINE-INTEGRITY-FIX-002-B: Write identity_gtm_strategy artifact with EVA keys
  // Matches pattern from stage-10-customer-brand.js and stage-11-visual-identity.js
  if (supabase && ventureId) {
    try {
      await writeArtifact(supabase, {
        ventureId,
        lifecycleStage: 12,
        artifactType: 'identity_gtm_strategy',
        title: 'GTM & Sales Strategy (Stage 12)',
        artifactData: { marketTiers, channels, salesModel, sales_cycle_days, deal_stages, funnel_stages, customer_journey, economyCheck },
        metadata: { channel_count: channels.length, tier_count: marketTiers.length, reality_gate_pass: reality_gate.pass, source: 'stage-12-analysis' },
        source: 'stage-12-analysis',
        visionKey,
        planKey,
      });
    } catch (artifactErr) {
      logger.warn('[Stage12] GTM artifact write failed (non-blocking)', { error: artifactErr.message });
    }
  }

  return {
    marketTiers,
    channels,
    salesModel,
    sales_cycle_days,
    deal_stages,
    funnel_stages,
    customer_journey,
    economyCheck,
    reality_gate,
    total_monthly_budget,
    avg_cac,
    fourBuckets, usage, llmFallbackCount,
  };
}

export { SALES_MODELS, CHANNEL_TYPES, REQUIRED_TIERS, REQUIRED_CHANNELS, MIN_DEAL_STAGES, MIN_FUNNEL_STAGES, MIN_JOURNEY_STEPS };
