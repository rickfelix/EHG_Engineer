#!/usr/bin/env node
/**
 * Pricing Sub-Agent - Pricing Strategy Development
 *
 * Purpose:
 * - Develop pricing models and tier structures
 * - Calculate unit economics (CAC, LTV, margins)
 * - Perform pricing sensitivity analysis
 * - Generate pricing_model Golden Nugget artifact
 *
 * Stage Coverage: Stage 7 (Pricing Strategy)
 * SD: SD-IND-A-STAGES-7-11 (Block A: GTM & Persona Fit)
 *
 * Evaluation Areas:
 * 1. Unit Economics - CAC, LTV, margins, breakeven
 * 2. Pricing Tiers - Structure, feature allocation, value proposition
 * 3. Market Alignment - Competitive positioning, willingness to pay
 * 4. Sensitivity Analysis - Price elasticity, scenario modeling
 *
 * Activation: Stage 7 or pricing-related SD context
 * Blocking: FAIL verdict blocks Stage 7 completion
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

// Pricing benchmarks by industry
const INDUSTRY_BENCHMARKS = {
  saas_b2b: {
    gross_margin_target: 0.70,
    ltv_cac_ratio_min: 3.0,
    payback_months_max: 18,
    churn_rate_max: 0.05
  },
  saas_b2c: {
    gross_margin_target: 0.60,
    ltv_cac_ratio_min: 2.5,
    payback_months_max: 12,
    churn_rate_max: 0.08
  },
  marketplace: {
    gross_margin_target: 0.40,
    ltv_cac_ratio_min: 2.0,
    payback_months_max: 24,
    churn_rate_max: 0.10
  },
  services: {
    gross_margin_target: 0.50,
    ltv_cac_ratio_min: 2.5,
    payback_months_max: 12,
    churn_rate_max: 0.15
  },
  default: {
    gross_margin_target: 0.40,
    ltv_cac_ratio_min: 3.0,
    payback_months_max: 18,
    churn_rate_max: 0.10
  }
};

/**
 * Execute Pricing Strategy Review
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} subAgent - Sub-agent configuration
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Review results
 */
export async function execute(sdId, subAgent, _options = {}) {
  console.log(`\n💰 PRICING STRATEGY REVIEW - Executing for ${sdId}\n`);

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  const results = {
    sd_id: sdId,
    sub_agent_code: 'PRICING',
    timestamp: new Date().toISOString(),
    verdict: 'PASS',
    confidence_score: 0,
    summary: '',
    findings: {
      unit_economics_score: 0,
      pricing_structure_score: 0,
      market_alignment_score: 0,
      sensitivity_score: 0
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
    let financialModel = null;

    if (ventureId) {
      const { data: ventureData } = await supabase
        .from('ventures')
        .select('*')
        .eq('id', ventureId)
        .single();
      venture = ventureData;

      // Try to fetch existing financial model from Stage 5
      const { data: stageWork } = await supabase
        .from('venture_stage_work')
        .select('artifacts')
        .eq('venture_id', ventureId)
        .eq('stage_id', 5)
        .single();

      if (stageWork?.artifacts?.financial_model) {
        financialModel = stageWork.artifacts.financial_model;
        console.log('   ✓ Found existing financial model from Stage 5');
      }
    }

    // ============================================
    // 2. DETERMINE INDUSTRY BENCHMARKS
    // ============================================
    console.log('\n📊 Step 2: Determining industry benchmarks...');

    const industry = venture?.industry_vertical || 'default';
    const benchmarks = INDUSTRY_BENCHMARKS[industry] || INDUSTRY_BENCHMARKS.default;
    console.log(`   Industry: ${industry}`);
    console.log(`   Gross Margin Target: ${(benchmarks.gross_margin_target * 100).toFixed(0)}%`);
    console.log(`   LTV:CAC Ratio Min: ${benchmarks.ltv_cac_ratio_min}:1`);

    // ============================================
    // 3. EVALUATE UNIT ECONOMICS
    // ============================================
    console.log('\n💵 Step 3: Evaluating unit economics...');

    const unitEconomics = evaluateUnitEconomics(financialModel, benchmarks, sd);
    results.findings.unit_economics_score = unitEconomics.score;
    results.recommendations.push(...unitEconomics.recommendations);
    results.blockers.push(...unitEconomics.blockers);
    console.log(`   Unit Economics Score: ${unitEconomics.score}/10`);

    // ============================================
    // 4. EVALUATE PRICING STRUCTURE
    // ============================================
    console.log('\n🏷️ Step 4: Evaluating pricing structure...');

    const pricingStructure = evaluatePricingStructure(financialModel, sd);
    results.findings.pricing_structure_score = pricingStructure.score;
    results.recommendations.push(...pricingStructure.recommendations);
    console.log(`   Pricing Structure Score: ${pricingStructure.score}/10`);

    // ============================================
    // 5. EVALUATE MARKET ALIGNMENT
    // ============================================
    console.log('\n🎯 Step 5: Evaluating market alignment...');

    const marketAlignment = evaluateMarketAlignment(venture, financialModel, sd);
    results.findings.market_alignment_score = marketAlignment.score;
    results.recommendations.push(...marketAlignment.recommendations);
    results.warnings.push(...marketAlignment.warnings);
    console.log(`   Market Alignment Score: ${marketAlignment.score}/10`);

    // ============================================
    // 6. EVALUATE SENSITIVITY ANALYSIS
    // ============================================
    console.log('\n📈 Step 6: Evaluating sensitivity analysis...');

    const sensitivity = evaluateSensitivityAnalysis(financialModel, sd);
    results.findings.sensitivity_score = sensitivity.score;
    results.recommendations.push(...sensitivity.recommendations);
    console.log(`   Sensitivity Score: ${sensitivity.score}/10`);

    // ============================================
    // 7. GENERATE PRICING MODEL ARTIFACT
    // ============================================
    console.log('\n📦 Step 7: Generating pricing_model artifact...');

    results.artifact = generatePricingArtifact({
      venture,
      sd,
      financialModel,
      benchmarks,
      scores: results.findings
    });
    console.log(`   Artifact generated: ${results.artifact.content.length} chars`);

    // ============================================
    // 8. CALCULATE VERDICT
    // ============================================
    console.log('\n📊 Step 8: Calculating final verdict...');

    const avgScore = (
      unitEconomics.score +
      pricingStructure.score +
      marketAlignment.score +
      sensitivity.score
    ) / 4;

    results.confidence_score = Math.round(avgScore * 10);

    if (results.blockers.length > 0) {
      results.verdict = 'FAIL';
      results.summary = `Pricing review FAILED with ${results.blockers.length} critical issue(s). Average score: ${avgScore.toFixed(1)}/10`;
    } else if (avgScore >= 8.0) {
      results.verdict = 'PASS';
      results.summary = `Pricing strategy meets standards. Average score: ${avgScore.toFixed(1)}/10`;
    } else if (avgScore >= 6.0) {
      results.verdict = 'CONDITIONAL_PASS';
      results.summary = `Pricing strategy acceptable with improvements needed. Average score: ${avgScore.toFixed(1)}/10`;
      results.justification = `Pricing model meets minimum viability (${avgScore.toFixed(1)}/10 average) but has room for optimization.`;
      results.conditions = results.recommendations.slice(0, 3).map(rec => ({
        action: rec,
        priority: 'medium',
        blocking: false
      }));
    } else {
      results.verdict = 'FAIL';
      results.summary = `Pricing strategy needs significant improvements. Average score: ${avgScore.toFixed(1)}/10`;
      results.blockers.push('Overall pricing quality score below acceptable threshold (6.0/10)');
    }

    console.log(`   Verdict: ${results.verdict}`);
    console.log(`   Confidence: ${results.confidence_score}%`);

  } catch (error) {
    console.error(`❌ Pricing review error: ${error.message}`);
    results.verdict = 'FAIL';
    results.confidence_score = 0;
    results.summary = `Pricing review failed: ${error.message}`;
    results.blockers.push(error.message);
  }

  // Print summary
  printSummary(results);

  return results;
}

/**
 * Evaluate unit economics
 */
function evaluateUnitEconomics(financialModel, benchmarks, _sd) {
  const result = { score: 7, recommendations: [], blockers: [] };

  if (!financialModel) {
    result.score = 5;
    result.recommendations.push('No financial model found from Stage 5 - create pricing from scratch');
    return result;
  }

  // Check gross margin
  const grossMargin = financialModel.gross_margin || 0;
  if (grossMargin < benchmarks.gross_margin_target) {
    result.score -= 2;
    result.recommendations.push(`Gross margin ${(grossMargin * 100).toFixed(0)}% below target ${(benchmarks.gross_margin_target * 100).toFixed(0)}%`);
  }

  // Check LTV:CAC ratio
  const ltvCacRatio = financialModel.ltv_cac_ratio || 0;
  if (ltvCacRatio < benchmarks.ltv_cac_ratio_min) {
    result.score -= 2;
    if (ltvCacRatio < 1.5) {
      result.blockers.push(`LTV:CAC ratio ${ltvCacRatio.toFixed(1)} is critically low (min: ${benchmarks.ltv_cac_ratio_min})`);
    } else {
      result.recommendations.push(`LTV:CAC ratio ${ltvCacRatio.toFixed(1)} below target ${benchmarks.ltv_cac_ratio_min}`);
    }
  }

  // Check payback period
  const paybackMonths = financialModel.payback_months || 0;
  if (paybackMonths > benchmarks.payback_months_max) {
    result.score -= 1;
    result.recommendations.push(`Payback period ${paybackMonths} months exceeds target ${benchmarks.payback_months_max} months`);
  }

  return result;
}

/**
 * Evaluate pricing structure
 */
function evaluatePricingStructure(financialModel, sd) {
  const result = { score: 7, recommendations: [] };

  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  // Check for tiered pricing
  const hasTiers = /\b(tier|plan|basic|pro|enterprise|premium)\b/i.test(content);
  if (!hasTiers) {
    result.score -= 1;
    result.recommendations.push('Consider implementing tiered pricing (Basic/Pro/Enterprise)');
  }

  // Check for value-based pricing
  const hasValueBased = /\b(value|roi|outcome|result)\b/i.test(content);
  if (!hasValueBased) {
    result.score -= 0.5;
    result.recommendations.push('Consider value-based pricing tied to customer outcomes');
  }

  // Check for freemium consideration
  const hasFreemium = /\b(free|trial|freemium)\b/i.test(content);
  if (!hasFreemium) {
    result.recommendations.push('Consider free trial or freemium tier for customer acquisition');
  }

  // Check for annual/monthly options
  const hasTermOptions = /\b(annual|monthly|yearly|subscription)\b/i.test(content);
  if (!hasTermOptions) {
    result.recommendations.push('Consider offering both monthly and annual pricing options');
  }

  return result;
}

/**
 * Evaluate market alignment
 */
function evaluateMarketAlignment(venture, financialModel, sd) {
  const result = { score: 7, recommendations: [], warnings: [] };

  // Check competitive positioning
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  const hasCompetitorAnalysis = /\b(competitor|competitive|market rate|benchmark)\b/i.test(content);
  if (!hasCompetitorAnalysis) {
    result.score -= 1;
    result.recommendations.push('Include competitive pricing analysis');
  }

  // Check willingness to pay
  const hasWTPAnalysis = /\b(willingness to pay|wtp|price sensitivity|customer research)\b/i.test(content);
  if (!hasWTPAnalysis) {
    result.score -= 1;
    result.recommendations.push('Include customer willingness-to-pay research');
  }

  // Check target segment alignment
  const hasSegmentAlignment = /\b(segment|persona|target customer|icp)\b/i.test(content);
  if (!hasSegmentAlignment) {
    result.score -= 0.5;
    result.warnings.push('Ensure pricing aligns with target customer segments');
  }

  return result;
}

/**
 * Evaluate sensitivity analysis
 */
function evaluateSensitivityAnalysis(financialModel, sd) {
  const result = { score: 6, recommendations: [] };

  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  // Check for scenario modeling
  const hasScenarios = /\b(scenario|best case|worst case|optimistic|pessimistic)\b/i.test(content);
  if (hasScenarios) {
    result.score += 1;
  } else {
    result.recommendations.push('Add scenario modeling (optimistic/base/pessimistic cases)');
  }

  // Check for price elasticity
  const hasElasticity = /\b(elasticity|price point|discount|sensitivity)\b/i.test(content);
  if (hasElasticity) {
    result.score += 1;
  } else {
    result.recommendations.push('Analyze price elasticity and discount impact');
  }

  // Check for breakeven analysis
  const hasBreakeven = /\b(breakeven|break-even|break even|profitability)\b/i.test(content);
  if (hasBreakeven) {
    result.score += 1;
  } else {
    result.recommendations.push('Include breakeven analysis at different price points');
  }

  return result;
}

/**
 * Generate pricing_model artifact
 */
function generatePricingArtifact({ venture, sd, financialModel, benchmarks, scores }) {
  const content = `# Pricing Model - ${venture?.name || sd.title}

## Executive Summary
Pricing strategy developed for Stage 7 of the venture lifecycle.

## Unit Economics
- Gross Margin Target: ${(benchmarks.gross_margin_target * 100).toFixed(0)}%
- LTV:CAC Ratio Target: ${benchmarks.ltv_cac_ratio_min}:1
- Payback Period Target: ${benchmarks.payback_months_max} months

## Pricing Structure
${financialModel?.pricing_tiers ? JSON.stringify(financialModel.pricing_tiers, null, 2) : 'To be defined based on market analysis.'}

## Quality Scores
- Unit Economics: ${scores.unit_economics_score}/10
- Pricing Structure: ${scores.pricing_structure_score}/10
- Market Alignment: ${scores.market_alignment_score}/10
- Sensitivity Analysis: ${scores.sensitivity_score}/10

## Next Steps
1. Validate pricing with customer interviews
2. A/B test price points
3. Monitor conversion rates by tier

Generated: ${new Date().toISOString()}
SD: ${sd.id}
`;

  return {
    type: 'pricing_model',
    content: content,
    generated_at: new Date().toISOString(),
    stage: 7,
    sd_id: sd.id,
    venture_id: venture?.id
  };
}

/**
 * Print summary to console
 */
function printSummary(results) {
  console.log('\n' + '='.repeat(60));
  console.log('PRICING STRATEGY REVIEW SUMMARY');
  console.log('='.repeat(60));
  console.log(`Verdict: ${results.verdict}`);
  console.log(`Confidence: ${results.confidence_score}%`);
  console.log('\nScores:');
  console.log(`  Unit Economics: ${results.findings.unit_economics_score}/10`);
  console.log(`  Pricing Structure: ${results.findings.pricing_structure_score}/10`);
  console.log(`  Market Alignment: ${results.findings.market_alignment_score}/10`);
  console.log(`  Sensitivity Analysis: ${results.findings.sensitivity_score}/10`);

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
