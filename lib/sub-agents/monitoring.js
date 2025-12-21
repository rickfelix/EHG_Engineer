#!/usr/bin/env node
/**
 * Monitoring Sub-Agent - Infrastructure & Application Monitoring
 *
 * Purpose:
 * - Design monitoring and observability architecture
 * - Define SLIs, SLOs, and SLAs
 * - Create alerting rules and runbooks
 * - Generate monitoring_config Golden Nugget artifact
 *
 * Stage Coverage: Stage 20, 24, 25 (Security, Analytics, Scale)
 * SD: SD-IND-C-STAGES-17-21 (Block C: MVP Feedback Loop)
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

// Monitoring pillars
const MONITORING_PILLARS = {
  metrics: ['cpu', 'memory', 'disk', 'network', 'latency', 'throughput', 'error_rate'],
  logs: ['application', 'access', 'error', 'audit', 'security'],
  traces: ['distributed_tracing', 'request_flow', 'service_map'],
  alerts: ['threshold', 'anomaly', 'composite', 'scheduled']
};

// SLO templates
const SLO_TEMPLATES = [
  { name: 'Availability', target: '99.9%', window: '30d' },
  { name: 'Latency p50', target: '<100ms', window: '30d' },
  { name: 'Latency p99', target: '<500ms', window: '30d' },
  { name: 'Error Rate', target: '<0.1%', window: '30d' }
];

export async function execute(sdId, subAgent, options = {}) {
  console.log(`\n📡 MONITORING ARCHITECTURE REVIEW - Executing for ${sdId}\n`);

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  const results = {
    sd_id: sdId,
    sub_agent_code: 'MONITORING',
    timestamp: new Date().toISOString(),
    verdict: 'PASS',
    confidence_score: 0,
    summary: '',
    findings: {
      observability_score: 0,
      slo_score: 0,
      alerting_score: 0,
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

    // Evaluate observability
    console.log('\n👁️ Evaluating observability...');
    const obsEval = evaluateObservability(sd, venture);
    results.findings.observability_score = obsEval.score;
    results.recommendations.push(...obsEval.recommendations);

    // Evaluate SLOs
    console.log('🎯 Evaluating SLOs...');
    const sloEval = evaluateSLOs(sd, venture);
    results.findings.slo_score = sloEval.score;
    results.recommendations.push(...sloEval.recommendations);

    // Evaluate alerting
    console.log('🚨 Evaluating alerting...');
    const alertEval = evaluateAlerting(sd, venture);
    results.findings.alerting_score = alertEval.score;
    results.recommendations.push(...alertEval.recommendations);

    // Evaluate tooling
    console.log('🔧 Evaluating monitoring tools...');
    const toolingEval = evaluateTooling(sd, venture);
    results.findings.tooling_score = toolingEval.score;
    results.recommendations.push(...toolingEval.recommendations);

    // Generate artifact
    results.artifact = generateMonitoringArtifact({ venture, sd, scores: results.findings });

    // Calculate verdict
    const avgScore = Object.values(results.findings).reduce((a, b) => a + b, 0) / 4;
    results.confidence_score = Math.round(avgScore * 10);

    if (avgScore >= 7.0) {
      results.verdict = 'PASS';
      results.summary = `Monitoring architecture meets standards. Average score: ${avgScore.toFixed(1)}/10`;
    } else if (avgScore >= 5.0) {
      results.verdict = 'CONDITIONAL_PASS';
      results.summary = `Monitoring architecture acceptable. Average score: ${avgScore.toFixed(1)}/10`;
    } else {
      results.verdict = 'FAIL';
      results.summary = `Monitoring architecture needs work. Average score: ${avgScore.toFixed(1)}/10`;
    }

    console.log(`\n   Verdict: ${results.verdict} (${results.confidence_score}%)`);

  } catch (error) {
    console.error(`❌ Monitoring review error: ${error.message}`);
    results.verdict = 'FAIL';
    results.summary = `Monitoring review failed: ${error.message}`;
    results.blockers.push(error.message);
  }

  return results;
}

function evaluateObservability(sd, venture) {
  const result = { score: 6, recommendations: [] };
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  const pillars = Object.keys(MONITORING_PILLARS);
  const covered = pillars.filter(p => content.includes(p));

  if (covered.length < 2) {
    result.score -= 1;
    result.recommendations.push('Cover all observability pillars (metrics, logs, traces)');
  }

  const hasInfra = /\b(cpu|memory|disk|infrastructure)\b/i.test(content);
  if (!hasInfra) {
    result.recommendations.push('Add infrastructure monitoring (CPU, memory, disk)');
  }

  return result;
}

function evaluateSLOs(sd, venture) {
  const result = { score: 6, recommendations: [] };
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  const hasSLO = /\b(slo|sli|sla|availability|uptime)\b/i.test(content);
  if (!hasSLO) {
    result.score -= 1;
    result.recommendations.push('Define SLOs (availability, latency, error rate)');
  }

  const hasTarget = /\b(99\.|target|objective|threshold)\b/i.test(content);
  if (!hasTarget) {
    result.recommendations.push('Set specific SLO targets (e.g., 99.9% availability)');
  }

  return result;
}

function evaluateAlerting(sd, venture) {
  const result = { score: 6, recommendations: [] };
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  const hasAlerts = /\b(alert|notification|pager|on-call)\b/i.test(content);
  if (!hasAlerts) {
    result.score -= 1;
    result.recommendations.push('Define alerting rules and escalation policies');
  }

  const hasRunbook = /\b(runbook|playbook|incident|response)\b/i.test(content);
  if (!hasRunbook) {
    result.recommendations.push('Create incident runbooks');
  }

  return result;
}

function evaluateTooling(sd, venture) {
  const result = { score: 6, recommendations: [] };
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  const tools = ['datadog', 'prometheus', 'grafana', 'new relic', 'cloudwatch', 'pagerduty'];
  const hasTools = tools.some(t => content.includes(t));

  if (!hasTools) {
    result.recommendations.push('Select monitoring stack (Datadog, Prometheus+Grafana, etc.)');
  }

  return result;
}

function generateMonitoringArtifact({ venture, sd, scores }) {
  const content = `# Monitoring Configuration - ${venture?.name || sd.title}

## Observability Pillars
${Object.entries(MONITORING_PILLARS).map(([pillar, items]) =>
  `### ${pillar.charAt(0).toUpperCase() + pillar.slice(1)}\n${items.map(i => `- ${i.replace(/_/g, ' ')}`).join('\n')}`
).join('\n\n')}

## SLO Targets
${SLO_TEMPLATES.map(s => `- ${s.name}: ${s.target} (${s.window} window)`).join('\n')}

## Quality Scores
- Observability: ${scores.observability_score}/10
- SLOs: ${scores.slo_score}/10
- Alerting: ${scores.alerting_score}/10
- Tooling: ${scores.tooling_score}/10

Generated: ${new Date().toISOString()}
`;

  return {
    type: 'monitoring_config',
    content,
    generated_at: new Date().toISOString(),
    stage: 20,
    sd_id: sd.id
  };
}

export default { execute };
