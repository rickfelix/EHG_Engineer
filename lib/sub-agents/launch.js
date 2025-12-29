#!/usr/bin/env node
/**
 * Launch Sub-Agent - Production Launch Orchestration
 *
 * Purpose:
 * - Create launch checklist and timeline
 * - Define go-live criteria and gates
 * - Plan rollback procedures
 * - Generate launch_checklist Golden Nugget artifact
 *
 * Stage Coverage: Stage 23 (Production Launch)
 * SD: SD-IND-D-STAGES-22-25 (Block D: Infrastructure & Exit)
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

// Launch checklist categories
const LAUNCH_CATEGORIES = {
  infrastructure: [
    'Production environment provisioned',
    'SSL certificates configured',
    'CDN configured',
    'Database backup configured',
    'Monitoring and alerting active'
  ],
  security: [
    'Security audit completed',
    'Penetration testing done',
    'HTTPS enforced',
    'Secrets management configured',
    'Access controls verified'
  ],
  quality: [
    'All tests passing',
    'Performance benchmarks met',
    'UAT sign-off obtained',
    'Bug backlog triaged',
    'Documentation complete'
  ],
  business: [
    'Legal review complete',
    'Terms of service published',
    'Privacy policy published',
    'Support channels ready',
    'Marketing materials ready'
  ],
  operations: [
    'On-call schedule defined',
    'Incident runbooks ready',
    'Rollback plan documented',
    'Communication plan ready',
    'Success metrics defined'
  ]
};

// Launch phases
const LAUNCH_PHASES = [
  { id: 'pre_launch', name: 'Pre-Launch (-7 days)', tasks: ['Final testing', 'Stakeholder alignment'] },
  { id: 'soft_launch', name: 'Soft Launch (-3 days)', tasks: ['Limited rollout', 'Monitor metrics'] },
  { id: 'launch_day', name: 'Launch Day', tasks: ['Full deployment', 'War room active'] },
  { id: 'post_launch', name: 'Post-Launch (+7 days)', tasks: ['Monitor stability', 'Gather feedback'] }
];

export async function execute(sdId, subAgent, _options = {}) {
  console.log(`\n🚀 LAUNCH READINESS REVIEW - Executing for ${sdId}\n`);

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  const results = {
    sd_id: sdId,
    sub_agent_code: 'LAUNCH',
    timestamp: new Date().toISOString(),
    verdict: 'PASS',
    confidence_score: 0,
    summary: '',
    findings: {
      infrastructure_score: 0,
      security_score: 0,
      quality_score: 0,
      operations_score: 0
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

    // Evaluate infrastructure readiness
    console.log('\n🏗️ Evaluating infrastructure readiness...');
    const infraEval = evaluateInfrastructure(sd, venture);
    results.findings.infrastructure_score = infraEval.score;
    results.recommendations.push(...infraEval.recommendations);
    results.blockers.push(...infraEval.blockers);

    // Evaluate security readiness
    console.log('🔒 Evaluating security readiness...');
    const securityEval = evaluateSecurity(sd, venture);
    results.findings.security_score = securityEval.score;
    results.recommendations.push(...securityEval.recommendations);
    results.blockers.push(...securityEval.blockers);

    // Evaluate quality readiness
    console.log('✅ Evaluating quality readiness...');
    const qualityEval = evaluateQuality(sd, venture);
    results.findings.quality_score = qualityEval.score;
    results.recommendations.push(...qualityEval.recommendations);

    // Evaluate operations readiness
    console.log('⚙️ Evaluating operations readiness...');
    const opsEval = evaluateOperations(sd, venture);
    results.findings.operations_score = opsEval.score;
    results.recommendations.push(...opsEval.recommendations);

    // Generate artifact
    results.artifact = generateLaunchArtifact({ venture, sd, scores: results.findings });

    // Calculate verdict
    const avgScore = Object.values(results.findings).reduce((a, b) => a + b, 0) / 4;
    results.confidence_score = Math.round(avgScore * 10);

    if (results.blockers.length > 0) {
      results.verdict = 'FAIL';
      results.summary = `Launch blocked: ${results.blockers.length} critical issues. Score: ${avgScore.toFixed(1)}/10`;
    } else if (avgScore >= 8.0) {
      results.verdict = 'PASS';
      results.summary = `Launch ready! All criteria met. Score: ${avgScore.toFixed(1)}/10`;
    } else if (avgScore >= 6.0) {
      results.verdict = 'CONDITIONAL_PASS';
      results.summary = `Launch possible with caveats. Score: ${avgScore.toFixed(1)}/10`;
    } else {
      results.verdict = 'FAIL';
      results.summary = `Not launch ready. Score: ${avgScore.toFixed(1)}/10`;
    }

    console.log(`\n   Verdict: ${results.verdict} (${results.confidence_score}%)`);

  } catch (error) {
    console.error(`❌ Launch review error: ${error.message}`);
    results.verdict = 'FAIL';
    results.summary = `Launch review failed: ${error.message}`;
    results.blockers.push(error.message);
  }

  return results;
}

function evaluateInfrastructure(sd, _venture) {
  const result = { score: 6, recommendations: [], blockers: [] };
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  const hasProduction = /\b(production|prod|live|deployed)\b/i.test(content);
  if (!hasProduction) {
    result.score -= 1;
    result.recommendations.push('Verify production environment is ready');
  }

  const hasBackup = /\b(backup|disaster recovery|dr)\b/i.test(content);
  if (!hasBackup) {
    result.blockers.push('Database backup strategy required before launch');
  }

  const hasMonitoring = /\b(monitor|alert|observ)\b/i.test(content);
  if (!hasMonitoring) {
    result.score -= 1;
    result.recommendations.push('Ensure monitoring is active');
  }

  return result;
}

function evaluateSecurity(sd, _venture) {
  const result = { score: 6, recommendations: [], blockers: [] };
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  const hasSSL = /\b(ssl|https|tls|certificate)\b/i.test(content);
  if (!hasSSL) {
    result.blockers.push('HTTPS/SSL must be configured');
  }

  const hasAudit = /\b(security audit|pentest|vulnerability)\b/i.test(content);
  if (!hasAudit) {
    result.recommendations.push('Complete security audit before launch');
  }

  return result;
}

function evaluateQuality(sd, _venture) {
  const result = { score: 6, recommendations: [] };
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  const hasTesting = /\b(test|qa|uat|quality)\b/i.test(content);
  if (!hasTesting) {
    result.score -= 1;
    result.recommendations.push('Complete QA and UAT sign-off');
  }

  const hasDocs = /\b(document|readme|guide|help)\b/i.test(content);
  if (!hasDocs) {
    result.recommendations.push('Ensure documentation is complete');
  }

  return result;
}

function evaluateOperations(sd, _venture) {
  const result = { score: 6, recommendations: [] };
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  const hasOnCall = /\b(on-call|oncall|pager|incident)\b/i.test(content);
  if (!hasOnCall) {
    result.recommendations.push('Define on-call rotation');
  }

  const hasRollback = /\b(rollback|revert|fallback)\b/i.test(content);
  if (!hasRollback) {
    result.recommendations.push('Document rollback procedures');
  }

  return result;
}

function generateLaunchArtifact({ venture, sd, scores }) {
  const content = `# Launch Checklist - ${venture?.name || sd.title}

## Launch Phases
${LAUNCH_PHASES.map(p => `### ${p.name}\n${p.tasks.map(t => `- [ ] ${t}`).join('\n')}`).join('\n\n')}

## Readiness Checklist
${Object.entries(LAUNCH_CATEGORIES).map(([cat, items]) =>
  `### ${cat.charAt(0).toUpperCase() + cat.slice(1)}\n${items.map(i => `- [ ] ${i}`).join('\n')}`
).join('\n\n')}

## Quality Scores
- Infrastructure: ${scores.infrastructure_score}/10
- Security: ${scores.security_score}/10
- Quality: ${scores.quality_score}/10
- Operations: ${scores.operations_score}/10

Generated: ${new Date().toISOString()}
`;

  return {
    type: 'launch_checklist',
    content,
    generated_at: new Date().toISOString(),
    stage: 23,
    sd_id: sd.id
  };
}

export default { execute };
