#!/usr/bin/env node
/**
 * Analytics Sub-Agent - Analytics & Metrics Setup
 *
 * Purpose:
 * - Design analytics architecture and data pipelines
 * - Define KPIs and success metrics
 * - Create dashboard specifications
 * - Generate analytics_dashboard Golden Nugget artifact
 *
 * Stage Coverage: Stage 24 (Analytics & Feedback)
 * SD: SD-IND-D-STAGES-22-25 (Block D: Infrastructure & Exit)
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

// Analytics categories
const ANALYTICS_CATEGORIES = {
  acquisition: ['traffic_sources', 'signups', 'conversion_rate', 'cac'],
  activation: ['onboarding_completion', 'time_to_value', 'feature_adoption'],
  retention: ['dau_mau', 'churn_rate', 'session_frequency', 'nps'],
  revenue: ['mrr', 'arr', 'arpu', 'ltv', 'expansion_revenue'],
  referral: ['viral_coefficient', 'referral_rate', 'nps']
};

// Dashboard types
const DASHBOARD_TYPES = [
  { id: 'executive', name: 'Executive Dashboard', metrics: ['mrr', 'arr', 'churn', 'nps'] },
  { id: 'product', name: 'Product Dashboard', metrics: ['dau', 'feature_usage', 'retention'] },
  { id: 'marketing', name: 'Marketing Dashboard', metrics: ['traffic', 'conversions', 'cac'] },
  { id: 'sales', name: 'Sales Dashboard', metrics: ['pipeline', 'win_rate', 'deal_size'] }
];

export async function execute(sdId, subAgent, _options = {}) {
  console.log(`\n📊 ANALYTICS ARCHITECTURE REVIEW - Executing for ${sdId}\n`);

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  const results = {
    sd_id: sdId,
    sub_agent_code: 'ANALYTICS',
    timestamp: new Date().toISOString(),
    verdict: 'PASS',
    confidence_score: 0,
    summary: '',
    findings: {
      metrics_coverage_score: 0,
      data_architecture_score: 0,
      dashboard_score: 0,
      tooling_score: 0
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

    // Evaluate metrics coverage
    console.log('\n📈 Evaluating metrics coverage...');
    const metricsEval = evaluateMetricsCoverage(sd, venture);
    results.findings.metrics_coverage_score = metricsEval.score;
    results.recommendations.push(...metricsEval.recommendations);

    // Evaluate data architecture
    console.log('🏗️ Evaluating data architecture...');
    const dataEval = evaluateDataArchitecture(sd, venture);
    results.findings.data_architecture_score = dataEval.score;
    results.recommendations.push(...dataEval.recommendations);

    // Evaluate dashboards
    console.log('📋 Evaluating dashboard design...');
    const dashboardEval = evaluateDashboards(sd, venture);
    results.findings.dashboard_score = dashboardEval.score;
    results.recommendations.push(...dashboardEval.recommendations);

    // Evaluate tooling
    console.log('🔧 Evaluating analytics tooling...');
    const toolingEval = evaluateTooling(sd, venture);
    results.findings.tooling_score = toolingEval.score;
    results.recommendations.push(...toolingEval.recommendations);

    // Generate artifact
    results.artifact = generateAnalyticsArtifact({ venture, sd, scores: results.findings });

    // Calculate verdict
    const avgScore = Object.values(results.findings).reduce((a, b) => a + b, 0) / 4;
    results.confidence_score = Math.round(avgScore * 10);

    if (avgScore >= 7.0) {
      results.verdict = 'PASS';
      results.summary = `Analytics architecture meets standards. Average score: ${avgScore.toFixed(1)}/10`;
    } else if (avgScore >= 5.0) {
      results.verdict = 'CONDITIONAL_PASS';
      results.summary = `Analytics architecture acceptable. Average score: ${avgScore.toFixed(1)}/10`;
    } else {
      results.verdict = 'FAIL';
      results.summary = `Analytics architecture needs work. Average score: ${avgScore.toFixed(1)}/10`;
    }

    console.log(`\n   Verdict: ${results.verdict} (${results.confidence_score}%)`);

  } catch (error) {
    console.error(`❌ Analytics review error: ${error.message}`);
    results.verdict = 'FAIL';
    results.summary = `Analytics review failed: ${error.message}`;
    results.blockers.push(error.message);
  }

  return results;
}

function evaluateMetricsCoverage(sd, _venture) {
  const result = { score: 6, recommendations: [] };
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  // Check AARRR metrics
  const categories = Object.keys(ANALYTICS_CATEGORIES);
  const covered = categories.filter(cat => {
    const metrics = ANALYTICS_CATEGORIES[cat];
    return metrics.some(m => content.includes(m.replace(/_/g, ' ')));
  });

  result.score = Math.min(10, 4 + covered.length * 1.2);

  if (covered.length < 3) {
    result.recommendations.push('Cover all AARRR pirate metrics (Acquisition, Activation, Retention, Revenue, Referral)');
  }

  return result;
}

function evaluateDataArchitecture(sd, _venture) {
  const result = { score: 6, recommendations: [] };
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  const hasEventTracking = /\b(event|track|log|capture)\b/i.test(content);
  if (!hasEventTracking) {
    result.score -= 1;
    result.recommendations.push('Define event tracking schema');
  }

  const hasDataWarehouse = /\b(warehouse|pipeline|etl|data lake)\b/i.test(content);
  if (!hasDataWarehouse) {
    result.recommendations.push('Consider data warehouse architecture');
  }

  return result;
}

function evaluateDashboards(sd, _venture) {
  const result = { score: 6, recommendations: [] };
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  const hasDashboard = /\b(dashboard|report|visualization|chart)\b/i.test(content);
  if (!hasDashboard) {
    result.score -= 1;
    result.recommendations.push('Design key dashboards (executive, product, marketing)');
  }

  const hasAlerts = /\b(alert|notification|threshold|anomaly)\b/i.test(content);
  if (!hasAlerts) {
    result.recommendations.push('Set up metric alerts and anomaly detection');
  }

  return result;
}

function evaluateTooling(sd, _venture) {
  const result = { score: 6, recommendations: [] };
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  const tools = ['mixpanel', 'amplitude', 'segment', 'google analytics', 'posthog', 'heap'];
  const hasTools = tools.some(t => content.includes(t));

  if (!hasTools) {
    result.recommendations.push('Select analytics tools (Mixpanel, Amplitude, PostHog, etc.)');
  }

  return result;
}

function generateAnalyticsArtifact({ venture, sd, scores }) {
  const content = `# Analytics Dashboard - ${venture?.name || sd.title}

## AARRR Metrics Framework
${Object.entries(ANALYTICS_CATEGORIES).map(([cat, metrics]) =>
  `### ${cat.charAt(0).toUpperCase() + cat.slice(1)}\n${metrics.map(m => `- ${m.replace(/_/g, ' ')}`).join('\n')}`
).join('\n\n')}

## Dashboard Types
${DASHBOARD_TYPES.map(d => `- ${d.name}: ${d.metrics.join(', ')}`).join('\n')}

## Quality Scores
- Metrics Coverage: ${scores.metrics_coverage_score}/10
- Data Architecture: ${scores.data_architecture_score}/10
- Dashboards: ${scores.dashboard_score}/10
- Tooling: ${scores.tooling_score}/10

Generated: ${new Date().toISOString()}
`;

  return {
    type: 'analytics_dashboard',
    content,
    generated_at: new Date().toISOString(),
    stage: 24,
    sd_id: sd.id
  };
}

export default { execute };
