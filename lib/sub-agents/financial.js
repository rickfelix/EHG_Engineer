#!/usr/bin/env node
/**
 * Financial Sub-Agent - Business Model Canvas & Financial Modeling
 *
 * Purpose:
 * - Develop Business Model Canvas with 9 building blocks
 * - Model revenue streams and cost structures
 * - Project financial viability and margins
 * - Generate business_model_canvas Golden Nugget artifact
 *
 * Stage Coverage: Stage 8 (Business Model Canvas)
 * SD: SD-IND-A-STAGES-7-11 (Block A: GTM & Persona Fit)
 *
 * Evaluation Areas:
 * 1. Business Model Canvas - 9 blocks completeness
 * 2. Revenue Model - Streams, pricing integration, projections
 * 3. Cost Structure - Fixed, variable, unit economics
 * 4. Financial Viability - Margins, breakeven, runway
 *
 * Activation: Stage 8 or financial-modeling SD context
 * Blocking: FAIL verdict blocks Stage 8 completion
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

// Business Model Canvas 9 Blocks
const BMC_BLOCKS = [
  'customer_segments',
  'value_propositions',
  'channels',
  'customer_relationships',
  'revenue_streams',
  'key_resources',
  'key_activities',
  'key_partnerships',
  'cost_structure'
];

// Financial model benchmarks by stage
const FINANCIAL_BENCHMARKS = {
  seed: {
    runway_months_min: 12,
    burn_rate_max: 50000,
    revenue_multiple_target: 10,
    gross_margin_min: 0.40
  },
  series_a: {
    runway_months_min: 18,
    burn_rate_max: 200000,
    revenue_multiple_target: 8,
    gross_margin_min: 0.50
  },
  series_b: {
    runway_months_min: 24,
    burn_rate_max: 500000,
    revenue_multiple_target: 6,
    gross_margin_min: 0.60
  },
  growth: {
    runway_months_min: 12,
    burn_rate_max: 1000000,
    revenue_multiple_target: 4,
    gross_margin_min: 0.65
  },
  default: {
    runway_months_min: 12,
    burn_rate_max: 75000,
    revenue_multiple_target: 10,
    gross_margin_min: 0.40
  }
};

// Cost category templates
const COST_CATEGORIES = {
  fixed: [
    'salaries',
    'office_rent',
    'software_subscriptions',
    'insurance',
    'legal_accounting'
  ],
  variable: [
    'hosting_infrastructure',
    'customer_acquisition',
    'transaction_fees',
    'support_costs',
    'commissions'
  ]
};

/**
 * Execute Financial Modeling Review
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} subAgent - Sub-agent configuration
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Review results
 */
export async function execute(sdId, subAgent, options = {}) {
  console.log(`\n📊 FINANCIAL MODELING REVIEW - Executing for ${sdId}\n`);

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  const results = {
    sd_id: sdId,
    sub_agent_code: 'FINANCIAL',
    timestamp: new Date().toISOString(),
    verdict: 'PASS',
    confidence_score: 0,
    summary: '',
    findings: {
      bmc_completeness_score: 0,
      revenue_model_score: 0,
      cost_structure_score: 0,
      financial_viability_score: 0
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

    if (ventureId) {
      const { data: ventureData } = await supabase
        .from('ventures')
        .select('*')
        .eq('id', ventureId)
        .single();
      venture = ventureData;

      // Try to fetch pricing model from Stage 7
      const { data: stageWork } = await supabase
        .from('venture_stage_work')
        .select('artifacts')
        .eq('venture_id', ventureId)
        .eq('stage_id', 7)
        .single();

      if (stageWork?.artifacts?.pricing_model) {
        pricingModel = stageWork.artifacts.pricing_model;
        console.log('   ✓ Found pricing model from Stage 7');
      }
    }

    // ============================================
    // 2. DETERMINE FUNDING STAGE BENCHMARKS
    // ============================================
    console.log('\n💰 Step 2: Determining funding stage benchmarks...');

    const fundingStage = venture?.funding_stage || 'default';
    const benchmarks = FINANCIAL_BENCHMARKS[fundingStage] || FINANCIAL_BENCHMARKS.default;
    console.log(`   Funding Stage: ${fundingStage}`);
    console.log(`   Runway Minimum: ${benchmarks.runway_months_min} months`);
    console.log(`   Gross Margin Target: ${(benchmarks.gross_margin_min * 100).toFixed(0)}%`);

    // ============================================
    // 3. EVALUATE BUSINESS MODEL CANVAS
    // ============================================
    console.log('\n📐 Step 3: Evaluating Business Model Canvas...');

    const bmcEval = evaluateBMCCompleteness(sd, venture);
    results.findings.bmc_completeness_score = bmcEval.score;
    results.recommendations.push(...bmcEval.recommendations);
    results.blockers.push(...bmcEval.blockers);
    console.log(`   BMC Completeness Score: ${bmcEval.score}/10`);
    console.log(`   Blocks Defined: ${bmcEval.blocksFound}/${BMC_BLOCKS.length}`);

    // ============================================
    // 4. EVALUATE REVENUE MODEL
    // ============================================
    console.log('\n💵 Step 4: Evaluating revenue model...');

    const revenueEval = evaluateRevenueModel(sd, venture, pricingModel);
    results.findings.revenue_model_score = revenueEval.score;
    results.recommendations.push(...revenueEval.recommendations);
    results.warnings.push(...revenueEval.warnings);
    console.log(`   Revenue Model Score: ${revenueEval.score}/10`);

    // ============================================
    // 5. EVALUATE COST STRUCTURE
    // ============================================
    console.log('\n📉 Step 5: Evaluating cost structure...');

    const costEval = evaluateCostStructure(sd, venture, benchmarks);
    results.findings.cost_structure_score = costEval.score;
    results.recommendations.push(...costEval.recommendations);
    console.log(`   Cost Structure Score: ${costEval.score}/10`);

    // ============================================
    // 6. EVALUATE FINANCIAL VIABILITY
    // ============================================
    console.log('\n📈 Step 6: Evaluating financial viability...');

    const viabilityEval = evaluateFinancialViability(sd, venture, benchmarks);
    results.findings.financial_viability_score = viabilityEval.score;
    results.recommendations.push(...viabilityEval.recommendations);
    results.blockers.push(...viabilityEval.blockers);
    console.log(`   Financial Viability Score: ${viabilityEval.score}/10`);

    // ============================================
    // 7. GENERATE BMC ARTIFACT
    // ============================================
    console.log('\n📦 Step 7: Generating business_model_canvas artifact...');

    results.artifact = generateBMCArtifact({
      venture,
      sd,
      pricingModel,
      benchmarks,
      scores: results.findings,
      bmcBlocks: bmcEval.blocks
    });
    console.log(`   Artifact generated: ${results.artifact.content.length} chars`);

    // ============================================
    // 8. CALCULATE VERDICT
    // ============================================
    console.log('\n📊 Step 8: Calculating final verdict...');

    const avgScore = (
      bmcEval.score +
      revenueEval.score +
      costEval.score +
      viabilityEval.score
    ) / 4;

    results.confidence_score = Math.round(avgScore * 10);

    if (results.blockers.length > 0) {
      results.verdict = 'FAIL';
      results.summary = `Financial review FAILED with ${results.blockers.length} critical issue(s). Average score: ${avgScore.toFixed(1)}/10`;
    } else if (avgScore >= 8.0) {
      results.verdict = 'PASS';
      results.summary = `Business model meets financial standards. Average score: ${avgScore.toFixed(1)}/10`;
    } else if (avgScore >= 6.0) {
      results.verdict = 'CONDITIONAL_PASS';
      results.summary = `Business model acceptable with improvements needed. Average score: ${avgScore.toFixed(1)}/10`;
      results.justification = `Financial model meets minimum viability (${avgScore.toFixed(1)}/10 average) but requires refinement.`;
      results.conditions = results.recommendations.slice(0, 3).map(rec => ({
        action: rec,
        priority: 'medium',
        blocking: false
      }));
    } else {
      results.verdict = 'FAIL';
      results.summary = `Business model needs significant improvements. Average score: ${avgScore.toFixed(1)}/10`;
      results.blockers.push('Overall financial quality score below acceptable threshold (6.0/10)');
    }

    console.log(`   Verdict: ${results.verdict}`);
    console.log(`   Confidence: ${results.confidence_score}%`);

  } catch (error) {
    console.error(`❌ Financial review error: ${error.message}`);
    results.verdict = 'FAIL';
    results.confidence_score = 0;
    results.summary = `Financial review failed: ${error.message}`;
    results.blockers.push(error.message);
  }

  // Print summary
  printSummary(results);

  return results;
}

/**
 * Evaluate Business Model Canvas completeness
 */
function evaluateBMCCompleteness(sd, venture) {
  const result = {
    score: 0,
    recommendations: [],
    blockers: [],
    blocksFound: 0,
    blocks: {}
  };

  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''} ${sd.rationale || ''}`.toLowerCase();
  const metadata = sd.metadata || {};

  // Check each BMC block
  const blockPatterns = {
    customer_segments: /\b(customer segment|target market|icp|persona|audience)\b/i,
    value_propositions: /\b(value prop|unique value|usp|benefit|solve|solution)\b/i,
    channels: /\b(channel|distribution|sales channel|marketing channel|reach)\b/i,
    customer_relationships: /\b(customer relation|support|community|self-service|dedicated)\b/i,
    revenue_streams: /\b(revenue|pricing|subscription|transaction|licensing|monetiz)\b/i,
    key_resources: /\b(key resource|asset|technology|intellectual property|talent)\b/i,
    key_activities: /\b(key activit|core activit|development|marketing|operations)\b/i,
    key_partnerships: /\b(partner|vendor|supplier|alliance|integration)\b/i,
    cost_structure: /\b(cost|expense|fixed cost|variable cost|burn rate)\b/i
  };

  BMC_BLOCKS.forEach(block => {
    const pattern = blockPatterns[block];
    if (pattern.test(content)) {
      result.blocksFound++;
      result.blocks[block] = { status: 'defined', source: 'content' };
    } else if (metadata[block]) {
      result.blocksFound++;
      result.blocks[block] = { status: 'defined', source: 'metadata' };
    } else {
      result.blocks[block] = { status: 'missing' };
      result.recommendations.push(`Define ${block.replace(/_/g, ' ')} in Business Model Canvas`);
    }
  });

  // Calculate score based on completeness
  result.score = Math.round((result.blocksFound / BMC_BLOCKS.length) * 10);

  // Critical blocks check
  const criticalBlocks = ['value_propositions', 'revenue_streams', 'cost_structure'];
  const missingCritical = criticalBlocks.filter(b => result.blocks[b]?.status === 'missing');

  if (missingCritical.length > 0) {
    result.blockers.push(`Critical BMC blocks missing: ${missingCritical.join(', ')}`);
    result.score = Math.max(0, result.score - 2);
  }

  return result;
}

/**
 * Evaluate revenue model
 */
function evaluateRevenueModel(sd, venture, pricingModel) {
  const result = { score: 7, recommendations: [], warnings: [] };

  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  // Check for pricing integration
  if (!pricingModel) {
    result.score -= 1;
    result.warnings.push('No pricing model from Stage 7 - revenue projections may be inaccurate');
  }

  // Check for multiple revenue streams
  const revenueTypes = ['subscription', 'transaction', 'licensing', 'service', 'advertising', 'commission'];
  const foundStreams = revenueTypes.filter(type => content.includes(type));

  if (foundStreams.length === 0) {
    result.score -= 2;
    result.recommendations.push('Define specific revenue stream types (subscription, transaction, etc.)');
  } else if (foundStreams.length === 1) {
    result.warnings.push('Consider diversifying revenue streams for resilience');
  }

  // Check for revenue projections
  const hasProjections = /\b(project|forecast|estimate|arr|mrr|revenue target)\b/i.test(content);
  if (!hasProjections) {
    result.score -= 1;
    result.recommendations.push('Add revenue projections (12-36 month forecast)');
  }

  // Check for unit economics integration
  const hasUnitEconomics = /\b(arpu|arpc|ltv|cac|aov|average order)\b/i.test(content);
  if (!hasUnitEconomics) {
    result.score -= 0.5;
    result.recommendations.push('Integrate unit economics metrics (ARPU, LTV, CAC)');
  }

  return result;
}

/**
 * Evaluate cost structure
 */
function evaluateCostStructure(sd, venture, benchmarks) {
  const result = { score: 7, recommendations: [] };

  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  // Check for fixed vs variable cost breakdown
  const hasFixedCosts = COST_CATEGORIES.fixed.some(cat => content.includes(cat));
  const hasVariableCosts = COST_CATEGORIES.variable.some(cat => content.includes(cat));

  if (!hasFixedCosts && !hasVariableCosts) {
    result.score -= 2;
    result.recommendations.push('Define fixed and variable cost categories');
  } else if (!hasFixedCosts) {
    result.score -= 1;
    result.recommendations.push('Add fixed cost breakdown (salaries, rent, subscriptions)');
  } else if (!hasVariableCosts) {
    result.score -= 1;
    result.recommendations.push('Add variable cost breakdown (hosting, acquisition, support)');
  }

  // Check for burn rate
  const hasBurnRate = /\b(burn rate|monthly burn|runway|cash flow)\b/i.test(content);
  if (!hasBurnRate) {
    result.score -= 1;
    result.recommendations.push('Calculate monthly burn rate and runway');
  }

  // Check for margin analysis
  const hasMargins = /\b(margin|gross margin|contribution margin|operating margin)\b/i.test(content);
  if (!hasMargins) {
    result.score -= 0.5;
    result.recommendations.push('Add margin analysis (gross, contribution, operating)');
  }

  // Check for cost optimization
  const hasCostOptimization = /\b(optimize|reduce|efficiency|scale|leverage)\b/i.test(content);
  if (!hasCostOptimization) {
    result.recommendations.push('Consider cost optimization strategies as you scale');
  }

  return result;
}

/**
 * Evaluate financial viability
 */
function evaluateFinancialViability(sd, venture, benchmarks) {
  const result = { score: 7, recommendations: [], blockers: [] };

  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();
  const metadata = sd.metadata || {};

  // Check for breakeven analysis
  const hasBreakeven = /\b(breakeven|break-even|break even|profitable)\b/i.test(content);
  if (!hasBreakeven) {
    result.score -= 1;
    result.recommendations.push('Add breakeven analysis');
  }

  // Check for funding/runway considerations
  const hasFundingPlan = /\b(funding|raise|investment|runway|seed|series)\b/i.test(content);
  if (!hasFundingPlan) {
    result.score -= 0.5;
    result.recommendations.push('Define funding requirements and runway targets');
  }

  // Check for financial milestones
  const hasMilestones = /\b(milestone|target|goal|kpi|metric)\b/i.test(content);
  if (!hasMilestones) {
    result.score -= 0.5;
    result.recommendations.push('Set financial milestones (e.g., $100K ARR, breakeven)');
  }

  // Check for risk assessment
  const hasRiskAssessment = /\b(risk|sensitivity|scenario|downside|contingency)\b/i.test(content);
  if (!hasRiskAssessment) {
    result.score -= 0.5;
    result.recommendations.push('Add financial risk assessment and contingency plans');
  }

  // Check for exit valuation consideration
  const hasExitValuation = /\b(exit|valuation|multiple|acquisition|ipo)\b/i.test(content);
  if (hasExitValuation) {
    result.score += 1;
  } else {
    result.recommendations.push('Consider exit valuation targets (ties to Stage 9)');
  }

  return result;
}

/**
 * Generate business_model_canvas artifact
 */
function generateBMCArtifact({ venture, sd, pricingModel, benchmarks, scores, bmcBlocks }) {
  const blocksSection = BMC_BLOCKS.map(block => {
    const status = bmcBlocks[block]?.status || 'unknown';
    const icon = status === 'defined' ? '✓' : '○';
    return `- ${icon} ${block.replace(/_/g, ' ').toUpperCase()}: ${status === 'defined' ? 'Defined' : 'Needs definition'}`;
  }).join('\n');

  const content = `# Business Model Canvas - ${venture?.name || sd.title}

## Executive Summary
Business Model Canvas developed for Stage 8 of the venture lifecycle.
Financial modeling aligned with ${venture?.funding_stage || 'seed'} stage benchmarks.

## BMC Building Blocks
${blocksSection}

## Financial Targets (${venture?.funding_stage || 'Seed'} Stage)
- Runway Target: ${benchmarks.runway_months_min}+ months
- Gross Margin Target: ${(benchmarks.gross_margin_min * 100).toFixed(0)}%+
- Revenue Multiple Target: ${benchmarks.revenue_multiple_target}x

## Revenue Model
${pricingModel ? 'Integrated with Stage 7 Pricing Model' : 'Pending pricing model integration from Stage 7'}

## Cost Structure Categories
### Fixed Costs
${COST_CATEGORIES.fixed.map(c => `- ${c.replace(/_/g, ' ')}`).join('\n')}

### Variable Costs
${COST_CATEGORIES.variable.map(c => `- ${c.replace(/_/g, ' ')}`).join('\n')}

## Quality Scores
- BMC Completeness: ${scores.bmc_completeness_score}/10
- Revenue Model: ${scores.revenue_model_score}/10
- Cost Structure: ${scores.cost_structure_score}/10
- Financial Viability: ${scores.financial_viability_score}/10

## Key Financial Metrics to Track
1. Monthly Recurring Revenue (MRR)
2. Annual Recurring Revenue (ARR)
3. Customer Acquisition Cost (CAC)
4. Lifetime Value (LTV)
5. Gross Margin
6. Burn Rate
7. Runway (months)
8. Contribution Margin

## Next Steps
1. Complete any missing BMC blocks
2. Build detailed financial projections (12-36 months)
3. Define financial milestones and KPIs
4. Proceed to Stage 9 (Exit-Oriented Design)

Generated: ${new Date().toISOString()}
SD: ${sd.id}
`;

  return {
    type: 'business_model_canvas',
    content: content,
    generated_at: new Date().toISOString(),
    stage: 8,
    sd_id: sd.id,
    venture_id: venture?.id,
    blocks: bmcBlocks
  };
}

/**
 * Print summary to console
 */
function printSummary(results) {
  console.log('\n' + '='.repeat(60));
  console.log('FINANCIAL MODELING REVIEW SUMMARY');
  console.log('='.repeat(60));
  console.log(`Verdict: ${results.verdict}`);
  console.log(`Confidence: ${results.confidence_score}%`);
  console.log('\nScores:');
  console.log(`  BMC Completeness: ${results.findings.bmc_completeness_score}/10`);
  console.log(`  Revenue Model: ${results.findings.revenue_model_score}/10`);
  console.log(`  Cost Structure: ${results.findings.cost_structure_score}/10`);
  console.log(`  Financial Viability: ${results.findings.financial_viability_score}/10`);

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
