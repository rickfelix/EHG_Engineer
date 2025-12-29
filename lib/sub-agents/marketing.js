#!/usr/bin/env node
/**
 * Marketing Sub-Agent - Go-to-Market Strategy Development
 *
 * Purpose:
 * - Develop comprehensive Go-to-Market (GTM) strategy
 * - Define target segments, channels, and messaging
 * - Create launch and growth campaign frameworks
 * - Generate gtm_plan Golden Nugget artifact
 *
 * Stage Coverage: Stage 11 (Go-to-Market Strategy)
 * SD: SD-IND-A-STAGES-7-11 (Block A: GTM & Persona Fit)
 *
 * Evaluation Areas:
 * 1. Target Market - Segment definition, ICP clarity, TAM/SAM/SOM
 * 2. Positioning - Value messaging, competitive differentiation
 * 3. Channels - Distribution, acquisition channels, funnel design
 * 4. Campaigns - Launch strategy, growth tactics, content plan
 *
 * Activation: Stage 11 or GTM-related SD context
 * Blocking: FAIL verdict blocks Stage 11 completion
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

// GTM framework components
const _GTM_COMPONENTS = {
  market_analysis: [
    'tam_sam_som',
    'market_trends',
    'competitive_landscape',
    'buyer_journey'
  ],
  positioning: [
    'value_proposition',
    'unique_selling_points',
    'brand_messaging',
    'competitive_positioning'
  ],
  channels: [
    'organic_channels',
    'paid_channels',
    'partnership_channels',
    'direct_sales'
  ],
  campaigns: [
    'launch_campaign',
    'content_strategy',
    'lead_generation',
    'retention_campaigns'
  ]
};

// Channel benchmarks by business model
const CHANNEL_BENCHMARKS = {
  saas_b2b: {
    primary_channels: ['content_marketing', 'linkedin', 'direct_sales', 'partnerships'],
    cac_range: { min: 200, max: 2000 },
    conversion_rate_target: 0.02,
    sales_cycle_days: 60
  },
  saas_b2c: {
    primary_channels: ['social_media', 'seo', 'paid_ads', 'referrals'],
    cac_range: { min: 10, max: 100 },
    conversion_rate_target: 0.05,
    sales_cycle_days: 14
  },
  marketplace: {
    primary_channels: ['seo', 'paid_ads', 'affiliate', 'community'],
    cac_range: { min: 20, max: 150 },
    conversion_rate_target: 0.03,
    sales_cycle_days: 7
  },
  enterprise: {
    primary_channels: ['account_based', 'events', 'direct_sales', 'analyst_relations'],
    cac_range: { min: 5000, max: 50000 },
    conversion_rate_target: 0.15,
    sales_cycle_days: 180
  },
  default: {
    primary_channels: ['content_marketing', 'social_media', 'seo', 'paid_ads'],
    cac_range: { min: 50, max: 500 },
    conversion_rate_target: 0.03,
    sales_cycle_days: 30
  }
};

// ICP (Ideal Customer Profile) framework
const ICP_DIMENSIONS = [
  'company_size',
  'industry_vertical',
  'geographic_region',
  'technology_stack',
  'budget_range',
  'decision_makers',
  'pain_points',
  'buying_triggers'
];

/**
 * Execute GTM Strategy Review
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} subAgent - Sub-agent configuration
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Review results
 */
export async function execute(sdId, subAgent, _options = {}) {
  console.log(`\n📢 GTM STRATEGY REVIEW - Executing for ${sdId}\n`);

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  const results = {
    sd_id: sdId,
    sub_agent_code: 'MARKETING',
    timestamp: new Date().toISOString(),
    verdict: 'PASS',
    confidence_score: 0,
    summary: '',
    findings: {
      target_market_score: 0,
      positioning_score: 0,
      channels_score: 0,
      campaigns_score: 0
    },
    recommendations: [],
    blockers: [],
    warnings: [],
    artifact: null,
    justification: null,
    conditions: null
  };

  try {
    // ============================================
    // 1. FETCH SD AND VENTURE CONTEXT
    // ============================================
    console.log('📋 Step 1: Fetching SD and venture context...');

    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (sdError || !sd) {
      throw new Error(`Failed to fetch SD: ${sdError?.message || 'Not found'}`);
    }

    console.log(`   ✓ SD: ${sd.title}`);

    // Get venture context from metadata if available
    const ventureId = sd.metadata?.venture_id;
    let venture = null;
    let pricingModel = null;
    let businessModel = null;

    if (ventureId) {
      const { data: ventureData } = await supabase
        .from('ventures')
        .select('*')
        .eq('id', ventureId)
        .single();
      venture = ventureData;

      // Fetch previous stage artifacts
      const { data: stageWork } = await supabase
        .from('venture_stage_work')
        .select('stage_id, artifacts')
        .eq('venture_id', ventureId)
        .in('stage_id', [7, 8, 10]);

      if (stageWork) {
        stageWork.forEach(sw => {
          if (sw.stage_id === 7) pricingModel = sw.artifacts?.pricing_model;
          if (sw.stage_id === 8) businessModel = sw.artifacts?.business_model_canvas;
        });
      }

      if (pricingModel) console.log('   ✓ Found pricing model from Stage 7');
      if (businessModel) console.log('   ✓ Found business model from Stage 8');
    }

    // ============================================
    // 2. DETERMINE CHANNEL BENCHMARKS
    // ============================================
    console.log('\n📊 Step 2: Determining channel benchmarks...');

    const businessType = venture?.business_model || 'default';
    const benchmarks = CHANNEL_BENCHMARKS[businessType] || CHANNEL_BENCHMARKS.default;
    console.log(`   Business Type: ${businessType}`);
    console.log(`   Primary Channels: ${benchmarks.primary_channels.join(', ')}`);
    console.log(`   CAC Range: $${benchmarks.cac_range.min} - $${benchmarks.cac_range.max}`);

    // ============================================
    // 3. EVALUATE TARGET MARKET
    // ============================================
    console.log('\n🎯 Step 3: Evaluating target market definition...');

    const targetMarket = evaluateTargetMarket(sd, venture);
    results.findings.target_market_score = targetMarket.score;
    results.recommendations.push(...targetMarket.recommendations);
    results.blockers.push(...targetMarket.blockers);
    console.log(`   Target Market Score: ${targetMarket.score}/10`);
    console.log(`   ICP Dimensions Defined: ${targetMarket.icpDimensionsFound}/${ICP_DIMENSIONS.length}`);

    // ============================================
    // 4. EVALUATE POSITIONING
    // ============================================
    console.log('\n💎 Step 4: Evaluating positioning strategy...');

    const positioning = evaluatePositioning(sd, venture);
    results.findings.positioning_score = positioning.score;
    results.recommendations.push(...positioning.recommendations);
    results.warnings.push(...positioning.warnings);
    console.log(`   Positioning Score: ${positioning.score}/10`);

    // ============================================
    // 5. EVALUATE CHANNELS
    // ============================================
    console.log('\n📡 Step 5: Evaluating channel strategy...');

    const channels = evaluateChannels(sd, venture, benchmarks);
    results.findings.channels_score = channels.score;
    results.recommendations.push(...channels.recommendations);
    console.log(`   Channels Score: ${channels.score}/10`);
    console.log(`   Channels Identified: ${channels.channelsFound}`);

    // ============================================
    // 6. EVALUATE CAMPAIGNS
    // ============================================
    console.log('\n📣 Step 6: Evaluating campaign strategy...');

    const campaigns = evaluateCampaigns(sd, venture);
    results.findings.campaigns_score = campaigns.score;
    results.recommendations.push(...campaigns.recommendations);
    console.log(`   Campaigns Score: ${campaigns.score}/10`);

    // ============================================
    // 7. GENERATE GTM PLAN ARTIFACT
    // ============================================
    console.log('\n📦 Step 7: Generating gtm_plan artifact...');

    results.artifact = generateGTMArtifact({
      venture,
      sd,
      pricingModel,
      businessModel,
      benchmarks,
      scores: results.findings,
      icpProfile: targetMarket.icpProfile,
      channelMix: channels.channelMix
    });
    console.log(`   Artifact generated: ${results.artifact.content.length} chars`);

    // ============================================
    // 8. CALCULATE VERDICT
    // ============================================
    console.log('\n📊 Step 8: Calculating final verdict...');

    const avgScore = (
      targetMarket.score +
      positioning.score +
      channels.score +
      campaigns.score
    ) / 4;

    results.confidence_score = Math.round(avgScore * 10);

    if (results.blockers.length > 0) {
      results.verdict = 'FAIL';
      results.summary = `GTM review FAILED with ${results.blockers.length} critical issue(s). Average score: ${avgScore.toFixed(1)}/10`;
    } else if (avgScore >= 8.0) {
      results.verdict = 'PASS';
      results.summary = `Go-to-Market strategy meets standards. Average score: ${avgScore.toFixed(1)}/10`;
    } else if (avgScore >= 6.0) {
      results.verdict = 'CONDITIONAL_PASS';
      results.summary = `GTM strategy acceptable with improvements needed. Average score: ${avgScore.toFixed(1)}/10`;
      results.justification = `GTM plan meets minimum viability (${avgScore.toFixed(1)}/10 average) but requires refinement.`;
      results.conditions = results.recommendations.slice(0, 3).map(rec => ({
        action: rec,
        priority: 'medium',
        blocking: false
      }));
    } else {
      results.verdict = 'FAIL';
      results.summary = `GTM strategy needs significant improvements. Average score: ${avgScore.toFixed(1)}/10`;
      results.blockers.push('Overall GTM quality score below acceptable threshold (6.0/10)');
    }

    console.log(`   Verdict: ${results.verdict}`);
    console.log(`   Confidence: ${results.confidence_score}%`);

  } catch (error) {
    console.error(`❌ GTM review error: ${error.message}`);
    results.verdict = 'FAIL';
    results.confidence_score = 0;
    results.summary = `GTM review failed: ${error.message}`;
    results.blockers.push(error.message);
  }

  // Print summary
  printSummary(results);

  return results;
}

/**
 * Evaluate target market definition
 */
function evaluateTargetMarket(sd, _venture) {
  const result = {
    score: 5,
    recommendations: [],
    blockers: [],
    icpDimensionsFound: 0,
    icpProfile: {}
  };

  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''} ${sd.rationale || ''}`.toLowerCase();

  // Check TAM/SAM/SOM
  const hasTamSamSom = /\b(tam|sam|som|total addressable|serviceable|market size)\b/i.test(content);
  if (hasTamSamSom) {
    result.score += 1;
  } else {
    result.recommendations.push('Define TAM/SAM/SOM market sizing');
  }

  // Check ICP dimensions
  const icpPatterns = {
    company_size: /\b(company size|employee|smb|mid-market|enterprise)\b/i,
    industry_vertical: /\b(industry|vertical|sector|niche)\b/i,
    geographic_region: /\b(region|geography|country|market|north america|emea|apac)\b/i,
    technology_stack: /\b(technology|stack|platform|integration|saas|cloud)\b/i,
    budget_range: /\b(budget|spend|investment|price point)\b/i,
    decision_makers: /\b(decision maker|buyer|stakeholder|champion|executive)\b/i,
    pain_points: /\b(pain point|challenge|problem|struggle|friction)\b/i,
    buying_triggers: /\b(trigger|event|signal|intent|ready to buy)\b/i
  };

  ICP_DIMENSIONS.forEach(dim => {
    const pattern = icpPatterns[dim];
    if (pattern && pattern.test(content)) {
      result.icpDimensionsFound++;
      result.icpProfile[dim] = 'defined';
    } else {
      result.icpProfile[dim] = 'missing';
    }
  });

  // Score based on ICP completeness
  result.score += Math.round((result.icpDimensionsFound / ICP_DIMENSIONS.length) * 3);

  // Critical check: must have at least pain points and decision makers
  if (!result.icpProfile.pain_points || result.icpProfile.pain_points === 'missing') {
    result.blockers.push('ICP missing pain points definition');
  }
  if (!result.icpProfile.decision_makers || result.icpProfile.decision_makers === 'missing') {
    result.recommendations.push('Define target decision makers and buying committee');
  }

  return result;
}

/**
 * Evaluate positioning strategy
 */
function evaluatePositioning(sd, _venture) {
  const result = { score: 7, recommendations: [], warnings: [] };

  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  // Check value proposition
  const hasValueProp = /\b(value prop|unique value|benefit|solve|solution for)\b/i.test(content);
  if (!hasValueProp) {
    result.score -= 2;
    result.recommendations.push('Define clear value proposition');
  }

  // Check competitive differentiation
  const hasDifferentiation = /\b(differentiat|unique|competitive advantage|better than|unlike)\b/i.test(content);
  if (!hasDifferentiation) {
    result.score -= 1;
    result.recommendations.push('Articulate competitive differentiation');
  }

  // Check messaging framework
  const hasMessaging = /\b(messag|tagline|positioning statement|elevator pitch)\b/i.test(content);
  if (!hasMessaging) {
    result.score -= 0.5;
    result.recommendations.push('Develop messaging framework and positioning statement');
  }

  // Check customer testimonials/proof
  const hasSocialProof = /\b(testimonial|case study|proof|validation|customer success)\b/i.test(content);
  if (!hasSocialProof) {
    result.warnings.push('Consider adding social proof elements (testimonials, case studies)');
  }

  // Check category creation/ownership
  const hasCategoryOwnership = /\b(category|leader|first|pioneer|define the space)\b/i.test(content);
  if (hasCategoryOwnership) {
    result.score += 1;
  }

  return result;
}

/**
 * Evaluate channel strategy
 */
function evaluateChannels(sd, venture, benchmarks) {
  const result = {
    score: 6,
    recommendations: [],
    channelsFound: 0,
    channelMix: []
  };

  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  // All possible channels to check
  const allChannels = {
    // Organic
    seo: /\b(seo|search engine|organic search)\b/i,
    content_marketing: /\b(content|blog|article|ebook|whitepaper)\b/i,
    social_organic: /\b(social media|linkedin|twitter|organic social)\b/i,
    community: /\b(community|forum|slack|discord)\b/i,
    referrals: /\b(referral|word of mouth|viral)\b/i,

    // Paid
    paid_search: /\b(paid search|ppc|google ads|sem)\b/i,
    paid_social: /\b(paid social|facebook ads|linkedin ads)\b/i,
    display: /\b(display|banner|programmatic)\b/i,
    retargeting: /\b(retarget|remarketing)\b/i,

    // Partnerships
    partnerships: /\b(partner|integration|ecosystem)\b/i,
    affiliate: /\b(affiliate|referral program)\b/i,
    resellers: /\b(reseller|channel partner|distributor)\b/i,

    // Direct
    direct_sales: /\b(direct sales|outbound|cold)\b/i,
    account_based: /\b(abm|account based|target account)\b/i,
    events: /\b(event|conference|webinar|trade show)\b/i,

    // Product-led
    product_led: /\b(product led|plg|freemium|trial)\b/i
  };

  // Find channels mentioned
  Object.entries(allChannels).forEach(([channel, pattern]) => {
    if (pattern.test(content)) {
      result.channelsFound++;
      result.channelMix.push(channel);
    }
  });

  // Score based on channel coverage
  if (result.channelsFound >= 5) {
    result.score += 2;
  } else if (result.channelsFound >= 3) {
    result.score += 1;
  } else if (result.channelsFound < 2) {
    result.score -= 2;
    result.recommendations.push('Define at least 3-5 go-to-market channels');
  }

  // Check for primary channel alignment with business type
  const primaryMatches = benchmarks.primary_channels.filter(ch =>
    result.channelMix.some(c => c.includes(ch) || ch.includes(c))
  );

  if (primaryMatches.length === 0) {
    result.recommendations.push(`Consider primary channels for your business model: ${benchmarks.primary_channels.join(', ')}`);
  }

  // Check for channel prioritization
  const hasPrioritization = /\b(primary|priorit|focus|key channel|main channel)\b/i.test(content);
  if (!hasPrioritization && result.channelsFound > 2) {
    result.recommendations.push('Prioritize top 2-3 channels for initial focus');
  }

  // Check for funnel mapping
  const hasFunnel = /\b(funnel|awareness|consideration|decision|conversion|nurture)\b/i.test(content);
  if (!hasFunnel) {
    result.recommendations.push('Map channels to funnel stages (awareness → conversion)');
  }

  return result;
}

/**
 * Evaluate campaign strategy
 */
function evaluateCampaigns(sd, _venture) {
  const result = { score: 6, recommendations: [] };

  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  // Check for launch strategy
  const hasLaunchPlan = /\b(launch|go live|release|beta|early access)\b/i.test(content);
  if (hasLaunchPlan) {
    result.score += 1;
  } else {
    result.recommendations.push('Define launch campaign strategy');
  }

  // Check for content strategy
  const hasContentPlan = /\b(content calendar|editorial|blog strategy|content plan)\b/i.test(content);
  if (hasContentPlan) {
    result.score += 1;
  } else {
    result.recommendations.push('Create content marketing calendar');
  }

  // Check for lead generation
  const hasLeadGen = /\b(lead gen|lead magnet|download|signup|capture)\b/i.test(content);
  if (hasLeadGen) {
    result.score += 0.5;
  } else {
    result.recommendations.push('Define lead generation tactics');
  }

  // Check for nurture strategy
  const hasNurture = /\b(nurture|email sequence|drip|automation)\b/i.test(content);
  if (hasNurture) {
    result.score += 0.5;
  } else {
    result.recommendations.push('Plan lead nurture sequences');
  }

  // Check for metrics/KPIs
  const hasMetrics = /\b(kpi|metric|measure|track|goal|target|conversion rate)\b/i.test(content);
  if (hasMetrics) {
    result.score += 1;
  } else {
    result.recommendations.push('Define GTM success metrics and KPIs');
  }

  return result;
}

/**
 * Generate gtm_plan artifact
 */
function generateGTMArtifact({ venture, sd, pricingModel, businessModel, benchmarks, scores, icpProfile, channelMix }) {
  const icpSection = ICP_DIMENSIONS.map(dim => {
    const status = icpProfile[dim] || 'unknown';
    const icon = status === 'defined' ? '✓' : '○';
    return `- ${icon} ${dim.replace(/_/g, ' ').toUpperCase()}: ${status === 'defined' ? 'Defined' : 'Needs definition'}`;
  }).join('\n');

  const channelSection = channelMix.length > 0
    ? channelMix.map(ch => `- ${ch.replace(/_/g, ' ')}`).join('\n')
    : '- No channels defined yet';

  const content = `# Go-to-Market Plan - ${venture?.name || sd.title}

## Executive Summary
Go-to-Market strategy developed for Stage 11 of the venture lifecycle.
Channel mix aligned with ${venture?.business_model || 'default'} business model benchmarks.

## Previous Stage Integration
${pricingModel ? '✓ Pricing Model (Stage 7): Integrated' : '○ Pricing Model (Stage 7): Pending'}
${businessModel ? '✓ Business Model Canvas (Stage 8): Integrated' : '○ Business Model Canvas (Stage 8): Pending'}

## Ideal Customer Profile (ICP)
${icpSection}

## Market Sizing
- Total Addressable Market (TAM): [To be quantified]
- Serviceable Addressable Market (SAM): [To be quantified]
- Serviceable Obtainable Market (SOM): [To be quantified]

## Channel Strategy
### Selected Channels
${channelSection}

### Recommended Primary Channels
Based on ${venture?.business_model || 'your'} business model:
${benchmarks.primary_channels.map(ch => `- ${ch.replace(/_/g, ' ')}`).join('\n')}

### Channel Benchmarks
- Expected CAC Range: $${benchmarks.cac_range.min} - $${benchmarks.cac_range.max}
- Conversion Rate Target: ${(benchmarks.conversion_rate_target * 100).toFixed(1)}%
- Average Sales Cycle: ${benchmarks.sales_cycle_days} days

## Campaign Framework
### Launch Campaign
- [ ] Beta user recruitment
- [ ] Early access program
- [ ] Launch announcement
- [ ] PR/Media outreach

### Content Strategy
- [ ] Blog editorial calendar
- [ ] Lead magnets (ebooks, templates)
- [ ] Case studies
- [ ] Product documentation

### Lead Generation
- [ ] Landing pages
- [ ] Lead capture forms
- [ ] Lead scoring model
- [ ] Nurture sequences

## Quality Scores
- Target Market: ${scores.target_market_score}/10
- Positioning: ${scores.positioning_score}/10
- Channels: ${scores.channels_score}/10
- Campaigns: ${scores.campaigns_score}/10

## GTM Metrics to Track
1. Marketing Qualified Leads (MQLs)
2. Sales Qualified Leads (SQLs)
3. Customer Acquisition Cost (CAC)
4. Lead-to-Customer Conversion Rate
5. Time to First Value
6. Customer Activation Rate
7. Channel Attribution
8. Campaign ROI

## Next Steps
1. Complete ICP definition
2. Finalize channel prioritization
3. Build launch campaign timeline
4. Set up attribution tracking
5. Proceed to Stage 12 (Sales & Success Logic)

Generated: ${new Date().toISOString()}
SD: ${sd.id}
`;

  return {
    type: 'gtm_plan',
    content: content,
    generated_at: new Date().toISOString(),
    stage: 11,
    sd_id: sd.id,
    venture_id: venture?.id,
    icp_profile: icpProfile,
    channel_mix: channelMix
  };
}

/**
 * Print summary to console
 */
function printSummary(results) {
  console.log('\n' + '='.repeat(60));
  console.log('GTM STRATEGY REVIEW SUMMARY');
  console.log('='.repeat(60));
  console.log(`Verdict: ${results.verdict}`);
  console.log(`Confidence: ${results.confidence_score}%`);
  console.log('\nScores:');
  console.log(`  Target Market: ${results.findings.target_market_score}/10`);
  console.log(`  Positioning: ${results.findings.positioning_score}/10`);
  console.log(`  Channels: ${results.findings.channels_score}/10`);
  console.log(`  Campaigns: ${results.findings.campaigns_score}/10`);

  if (results.blockers.length > 0) {
    console.log(`\n🚨 Blockers (${results.blockers.length}):`);
    results.blockers.forEach(b => console.log(`   - ${b}`));
  }

  if (results.recommendations.length > 0) {
    console.log(`\n💡 Recommendations (${results.recommendations.length}):`);
    results.recommendations.slice(0, 5).forEach(r => console.log(`   - ${r}`));
    if (results.recommendations.length > 5) {
      console.log(`   ... and ${results.recommendations.length - 5} more`);
    }
  }

  console.log('='.repeat(60) + '\n');
}

export default { execute };
