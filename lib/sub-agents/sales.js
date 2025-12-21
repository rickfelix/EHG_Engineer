#!/usr/bin/env node
/**
 * Sales Sub-Agent - Sales Strategy & Playbook Development
 *
 * Purpose:
 * - Develop sales process and playbook
 * - Define sales stages and conversion metrics
 * - Create objection handling frameworks
 * - Generate sales_playbook Golden Nugget artifact
 *
 * Stage Coverage: Stage 12 (Sales & Success Logic)
 * SD: SD-IND-B-STAGES-12-16 (Block B: Sales & Operational Flow)
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

// Sales process stages
const SALES_STAGES = [
  { id: 'prospecting', name: 'Prospecting', typical_conversion: 0.30 },
  { id: 'qualification', name: 'Qualification', typical_conversion: 0.50 },
  { id: 'discovery', name: 'Discovery', typical_conversion: 0.60 },
  { id: 'proposal', name: 'Proposal', typical_conversion: 0.70 },
  { id: 'negotiation', name: 'Negotiation', typical_conversion: 0.80 },
  { id: 'closed_won', name: 'Closed Won', typical_conversion: 1.0 }
];

// Sales methodology frameworks
const SALES_METHODOLOGIES = {
  solution_selling: { name: 'Solution Selling', best_for: 'Complex B2B', cycle: 'Long' },
  challenger_sale: { name: 'Challenger Sale', best_for: 'Enterprise', cycle: 'Long' },
  spin_selling: { name: 'SPIN Selling', best_for: 'Consultative', cycle: 'Medium' },
  sandler: { name: 'Sandler Selling', best_for: 'SMB', cycle: 'Medium' },
  product_led: { name: 'Product-Led Sales', best_for: 'SaaS/Self-serve', cycle: 'Short' }
};

export async function execute(sdId, subAgent, options = {}) {
  console.log(`\n💼 SALES STRATEGY REVIEW - Executing for ${sdId}\n`);

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  const results = {
    sd_id: sdId,
    sub_agent_code: 'SALES',
    timestamp: new Date().toISOString(),
    verdict: 'PASS',
    confidence_score: 0,
    summary: '',
    findings: {
      sales_process_score: 0,
      methodology_score: 0,
      metrics_score: 0,
      enablement_score: 0
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

    // Evaluate sales process
    console.log('\n📊 Evaluating sales process...');
    const processEval = evaluateSalesProcess(sd, venture);
    results.findings.sales_process_score = processEval.score;
    results.recommendations.push(...processEval.recommendations);

    // Evaluate methodology
    console.log('📋 Evaluating sales methodology...');
    const methodologyEval = evaluateMethodology(sd, venture);
    results.findings.methodology_score = methodologyEval.score;
    results.recommendations.push(...methodologyEval.recommendations);

    // Evaluate metrics
    console.log('📈 Evaluating sales metrics...');
    const metricsEval = evaluateMetrics(sd, venture);
    results.findings.metrics_score = metricsEval.score;
    results.recommendations.push(...metricsEval.recommendations);

    // Evaluate enablement
    console.log('🎯 Evaluating sales enablement...');
    const enablementEval = evaluateEnablement(sd, venture);
    results.findings.enablement_score = enablementEval.score;
    results.recommendations.push(...enablementEval.recommendations);

    // Generate artifact
    results.artifact = generateSalesArtifact({ venture, sd, scores: results.findings });

    // Calculate verdict
    const avgScore = Object.values(results.findings).reduce((a, b) => a + b, 0) / 4;
    results.confidence_score = Math.round(avgScore * 10);

    if (avgScore >= 7.0) {
      results.verdict = 'PASS';
      results.summary = `Sales strategy meets standards. Average score: ${avgScore.toFixed(1)}/10`;
    } else if (avgScore >= 5.0) {
      results.verdict = 'CONDITIONAL_PASS';
      results.summary = `Sales strategy acceptable with improvements. Average score: ${avgScore.toFixed(1)}/10`;
    } else {
      results.verdict = 'FAIL';
      results.summary = `Sales strategy needs significant work. Average score: ${avgScore.toFixed(1)}/10`;
    }

    console.log(`\n   Verdict: ${results.verdict} (${results.confidence_score}%)`);

  } catch (error) {
    console.error(`❌ Sales review error: ${error.message}`);
    results.verdict = 'FAIL';
    results.summary = `Sales review failed: ${error.message}`;
    results.blockers.push(error.message);
  }

  return results;
}

function evaluateSalesProcess(sd, venture) {
  const result = { score: 6, recommendations: [] };
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  const hasStages = /\b(stage|funnel|pipeline|qualification)\b/i.test(content);
  if (!hasStages) {
    result.score -= 1;
    result.recommendations.push('Define clear sales stages and funnel');
  }

  const hasICP = /\b(icp|ideal customer|target buyer|persona)\b/i.test(content);
  if (!hasICP) {
    result.score -= 1;
    result.recommendations.push('Define Ideal Customer Profile for sales targeting');
  }

  const hasHandoff = /\b(handoff|hand-off|marketing to sales|mql|sql)\b/i.test(content);
  if (!hasHandoff) {
    result.recommendations.push('Define marketing-to-sales handoff process');
  }

  return result;
}

function evaluateMethodology(sd, venture) {
  const result = { score: 6, recommendations: [] };
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  const hasMethodology = Object.keys(SALES_METHODOLOGIES).some(m =>
    content.includes(m.replace(/_/g, ' ')) || content.includes(m.replace(/_/g, '-'))
  );

  if (!hasMethodology) {
    result.score -= 1;
    result.recommendations.push('Select a sales methodology (Solution Selling, SPIN, Challenger, etc.)');
  }

  const hasPlaybook = /\b(playbook|script|talk track|discovery call)\b/i.test(content);
  if (!hasPlaybook) {
    result.recommendations.push('Create sales playbook with talk tracks');
  }

  return result;
}

function evaluateMetrics(sd, venture) {
  const result = { score: 6, recommendations: [] };
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  const hasConversion = /\b(conversion|close rate|win rate)\b/i.test(content);
  if (!hasConversion) {
    result.score -= 1;
    result.recommendations.push('Define conversion rate targets per stage');
  }

  const hasCycle = /\b(cycle|deal length|time to close)\b/i.test(content);
  if (!hasCycle) {
    result.recommendations.push('Define target sales cycle length');
  }

  const hasQuota = /\b(quota|target|revenue goal)\b/i.test(content);
  if (!hasQuota) {
    result.recommendations.push('Set sales quotas and revenue targets');
  }

  return result;
}

function evaluateEnablement(sd, venture) {
  const result = { score: 6, recommendations: [] };
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  const hasCollateral = /\b(collateral|deck|demo|case study)\b/i.test(content);
  if (!hasCollateral) {
    result.recommendations.push('Create sales collateral (decks, case studies)');
  }

  const hasObjections = /\b(objection|faq|concern|competitor)\b/i.test(content);
  if (!hasObjections) {
    result.recommendations.push('Document objection handling responses');
  }

  return result;
}

function generateSalesArtifact({ venture, sd, scores }) {
  const content = `# Sales Playbook - ${venture?.name || sd.title}

## Sales Process Stages
${SALES_STAGES.map(s => `- ${s.name}: ${(s.typical_conversion * 100).toFixed(0)}% target conversion`).join('\n')}

## Quality Scores
- Sales Process: ${scores.sales_process_score}/10
- Methodology: ${scores.methodology_score}/10
- Metrics: ${scores.metrics_score}/10
- Enablement: ${scores.enablement_score}/10

Generated: ${new Date().toISOString()}
`;

  return {
    type: 'sales_playbook',
    content,
    generated_at: new Date().toISOString(),
    stage: 12,
    sd_id: sd.id
  };
}

export default { execute };
