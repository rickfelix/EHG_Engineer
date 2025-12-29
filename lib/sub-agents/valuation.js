#!/usr/bin/env node
/**
 * Valuation Sub-Agent - Exit Valuation & Financial Modeling
 *
 * Purpose:
 * - Calculate company valuation using multiple methods
 * - Model exit scenarios and returns
 * - Generate investor-ready financial projections
 * - Generate valuation_model Golden Nugget artifact
 *
 * Stage Coverage: Stage 9, 25 (Exit Design, Scale)
 * SD: SD-IND-D-STAGES-22-25 (Block D: Infrastructure & Exit)
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

// Valuation methods
const VALUATION_METHODS = {
  revenue_multiple: {
    name: 'Revenue Multiple',
    description: 'Enterprise Value = Revenue × Multiple',
    typical_range: { saas: '5-15x', marketplace: '2-5x', services: '1-3x' }
  },
  dcf: {
    name: 'Discounted Cash Flow',
    description: 'Present value of future cash flows',
    discount_rate: '15-25%'
  },
  comparables: {
    name: 'Comparable Transactions',
    description: 'Based on similar company acquisitions',
    data_source: 'M&A databases'
  },
  venture_method: {
    name: 'Venture Capital Method',
    description: 'Exit value / Target return',
    typical_return: '10-30x'
  }
};

// Exit types and typical multiples
const EXIT_MULTIPLES = {
  strategic_acquisition: { low: 3, mid: 6, high: 12 },
  private_equity: { low: 4, mid: 8, high: 15 },
  ipo: { low: 10, mid: 20, high: 40 },
  merger: { low: 2, mid: 5, high: 10 }
};

export async function execute(sdId, subAgent, _options = {}) {
  console.log(`\n💎 VALUATION MODELING REVIEW - Executing for ${sdId}\n`);

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  const results = {
    sd_id: sdId,
    sub_agent_code: 'VALUATION',
    timestamp: new Date().toISOString(),
    verdict: 'PASS',
    confidence_score: 0,
    summary: '',
    findings: {
      methodology_score: 0,
      projections_score: 0,
      comparables_score: 0,
      scenario_score: 0
    },
    recommendations: [],
    blockers: [],
    warnings: [],
    artifact: null
  };

  try {
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (sdError || !sd) {
      throw new Error(`Failed to fetch SD: ${sdError?.message || 'Not found'}`);
    }

    console.log(`   ✓ SD: ${sd.title}`);

    const ventureId = sd.metadata?.venture_id;
    let venture = null;

    if (ventureId) {
      const { data: ventureData } = await supabase
        .from('ventures')
        .select('*')
        .eq('id', ventureId)
        .single();
      venture = ventureData;
    }

    // Evaluate methodology
    console.log('\n📊 Evaluating valuation methodology...');
    const methodEval = evaluateMethodology(sd, venture);
    results.findings.methodology_score = methodEval.score;
    results.recommendations.push(...methodEval.recommendations);

    // Evaluate projections
    console.log('📈 Evaluating financial projections...');
    const projEval = evaluateProjections(sd, venture);
    results.findings.projections_score = projEval.score;
    results.recommendations.push(...projEval.recommendations);

    // Evaluate comparables
    console.log('🔍 Evaluating comparable analysis...');
    const compEval = evaluateComparables(sd, venture);
    results.findings.comparables_score = compEval.score;
    results.recommendations.push(...compEval.recommendations);

    // Evaluate scenarios
    console.log('🎯 Evaluating exit scenarios...');
    const scenarioEval = evaluateScenarios(sd, venture);
    results.findings.scenario_score = scenarioEval.score;
    results.recommendations.push(...scenarioEval.recommendations);

    // Generate artifact
    results.artifact = generateValuationArtifact({ venture, sd, scores: results.findings });

    // Calculate verdict
    const avgScore = Object.values(results.findings).reduce((a, b) => a + b, 0) / 4;
    results.confidence_score = Math.round(avgScore * 10);

    if (avgScore >= 7.0) {
      results.verdict = 'PASS';
      results.summary = `Valuation model meets standards. Score: ${avgScore.toFixed(1)}/10`;
    } else if (avgScore >= 5.0) {
      results.verdict = 'CONDITIONAL_PASS';
      results.summary = `Valuation model acceptable. Score: ${avgScore.toFixed(1)}/10`;
    } else {
      results.verdict = 'FAIL';
      results.summary = `Valuation model needs work. Score: ${avgScore.toFixed(1)}/10`;
    }

    console.log(`\n   Verdict: ${results.verdict} (${results.confidence_score}%)`);

  } catch (error) {
    console.error(`❌ Valuation review error: ${error.message}`);
    results.verdict = 'FAIL';
    results.summary = `Valuation review failed: ${error.message}`;
    results.blockers.push(error.message);
  }

  return results;
}

function evaluateMethodology(sd, _venture) {
  const result = { score: 6, recommendations: [] };
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  const methods = Object.keys(VALUATION_METHODS);
  const found = methods.filter(m => content.includes(m.replace(/_/g, ' ')));

  if (found.length === 0) {
    result.score -= 1;
    result.recommendations.push('Apply at least one valuation methodology (revenue multiple, DCF, comparables)');
  }

  const hasMultiple = /\b(\d+x|multiple|multiplier)\b/i.test(content);
  if (!hasMultiple) {
    result.recommendations.push('Define target valuation multiples');
  }

  return result;
}

function evaluateProjections(sd, _venture) {
  const result = { score: 6, recommendations: [] };
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  const hasRevenue = /\b(revenue|arr|mrr|forecast)\b/i.test(content);
  if (!hasRevenue) {
    result.score -= 1;
    result.recommendations.push('Include revenue projections (3-5 years)');
  }

  const hasGrowth = /\b(growth|cagr|yoy)\b/i.test(content);
  if (!hasGrowth) {
    result.recommendations.push('Define growth rate assumptions');
  }

  return result;
}

function evaluateComparables(sd, _venture) {
  const result = { score: 6, recommendations: [] };
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  const hasComps = /\b(comparable|peer|benchmark|similar compan)\b/i.test(content);
  if (!hasComps) {
    result.score -= 1;
    result.recommendations.push('Research comparable company valuations');
  }

  const hasTransactions = /\b(acquisition|transaction|deal|m&a)\b/i.test(content);
  if (!hasTransactions) {
    result.recommendations.push('Analyze recent comparable transactions');
  }

  return result;
}

function evaluateScenarios(sd, _venture) {
  const result = { score: 6, recommendations: [] };
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  const hasScenarios = /\b(scenario|best case|worst case|base case)\b/i.test(content);
  if (!hasScenarios) {
    result.score -= 1;
    result.recommendations.push('Model multiple exit scenarios (base, optimistic, pessimistic)');
  }

  const hasTimeline = /\b(timeline|year|horizon|exit year)\b/i.test(content);
  if (!hasTimeline) {
    result.recommendations.push('Define exit timeline (e.g., 5-7 years)');
  }

  return result;
}

function generateValuationArtifact({ venture, sd, scores }) {
  const content = `# Valuation Model - ${venture?.name || sd.title}

## Valuation Methods
${Object.entries(VALUATION_METHODS).map(([_key, method]) =>
  `### ${method.name}\n${method.description}`
).join('\n\n')}

## Exit Multiples by Type
${Object.entries(EXIT_MULTIPLES).map(([type, mult]) =>
  `- ${type.replace(/_/g, ' ')}: ${mult.low}x - ${mult.high}x (mid: ${mult.mid}x)`
).join('\n')}

## Quality Scores
- Methodology: ${scores.methodology_score}/10
- Projections: ${scores.projections_score}/10
- Comparables: ${scores.comparables_score}/10
- Scenarios: ${scores.scenario_score}/10

Generated: ${new Date().toISOString()}
`;

  return {
    type: 'valuation_model',
    content,
    generated_at: new Date().toISOString(),
    stage: 25,
    sd_id: sd.id
  };
}

export default { execute };
