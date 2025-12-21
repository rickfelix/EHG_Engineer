#!/usr/bin/env node
/**
 * CRM Sub-Agent - Customer Relationship Management Setup
 *
 * Purpose:
 * - Design CRM data model and workflows
 * - Define customer lifecycle stages
 * - Create automation and nurture sequences
 * - Generate crm_architecture Golden Nugget artifact
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

// CRM entity types
const CRM_ENTITIES = [
  'leads', 'contacts', 'accounts', 'opportunities',
  'activities', 'tasks', 'notes', 'deals'
];

// Customer lifecycle stages
const LIFECYCLE_STAGES = [
  { id: 'subscriber', name: 'Subscriber', description: 'Email subscriber' },
  { id: 'lead', name: 'Lead', description: 'Shown interest' },
  { id: 'mql', name: 'MQL', description: 'Marketing qualified' },
  { id: 'sql', name: 'SQL', description: 'Sales qualified' },
  { id: 'opportunity', name: 'Opportunity', description: 'In sales process' },
  { id: 'customer', name: 'Customer', description: 'Paying customer' },
  { id: 'evangelist', name: 'Evangelist', description: 'Active promoter' }
];

export async function execute(sdId, subAgent, options = {}) {
  console.log(`\n🗃️ CRM ARCHITECTURE REVIEW - Executing for ${sdId}\n`);

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  const results = {
    sd_id: sdId,
    sub_agent_code: 'CRM',
    timestamp: new Date().toISOString(),
    verdict: 'PASS',
    confidence_score: 0,
    summary: '',
    findings: {
      data_model_score: 0,
      lifecycle_score: 0,
      automation_score: 0,
      integration_score: 0
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

    // Evaluate data model
    console.log('\n📊 Evaluating CRM data model...');
    const dataModelEval = evaluateDataModel(sd, venture);
    results.findings.data_model_score = dataModelEval.score;
    results.recommendations.push(...dataModelEval.recommendations);

    // Evaluate lifecycle
    console.log('🔄 Evaluating customer lifecycle...');
    const lifecycleEval = evaluateLifecycle(sd, venture);
    results.findings.lifecycle_score = lifecycleEval.score;
    results.recommendations.push(...lifecycleEval.recommendations);

    // Evaluate automation
    console.log('⚡ Evaluating automation...');
    const automationEval = evaluateAutomation(sd, venture);
    results.findings.automation_score = automationEval.score;
    results.recommendations.push(...automationEval.recommendations);

    // Evaluate integration
    console.log('🔗 Evaluating integrations...');
    const integrationEval = evaluateIntegration(sd, venture);
    results.findings.integration_score = integrationEval.score;
    results.recommendations.push(...integrationEval.recommendations);

    // Generate artifact
    results.artifact = generateCRMArtifact({ venture, sd, scores: results.findings });

    // Calculate verdict
    const avgScore = Object.values(results.findings).reduce((a, b) => a + b, 0) / 4;
    results.confidence_score = Math.round(avgScore * 10);

    if (avgScore >= 7.0) {
      results.verdict = 'PASS';
      results.summary = `CRM architecture meets standards. Average score: ${avgScore.toFixed(1)}/10`;
    } else if (avgScore >= 5.0) {
      results.verdict = 'CONDITIONAL_PASS';
      results.summary = `CRM architecture acceptable. Average score: ${avgScore.toFixed(1)}/10`;
    } else {
      results.verdict = 'FAIL';
      results.summary = `CRM architecture needs work. Average score: ${avgScore.toFixed(1)}/10`;
    }

    console.log(`\n   Verdict: ${results.verdict} (${results.confidence_score}%)`);

  } catch (error) {
    console.error(`❌ CRM review error: ${error.message}`);
    results.verdict = 'FAIL';
    results.summary = `CRM review failed: ${error.message}`;
    results.blockers.push(error.message);
  }

  return results;
}

function evaluateDataModel(sd, venture) {
  const result = { score: 6, recommendations: [] };
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  const entitiesFound = CRM_ENTITIES.filter(e => content.includes(e));
  if (entitiesFound.length < 3) {
    result.score -= 1;
    result.recommendations.push('Define core CRM entities (leads, contacts, accounts, opportunities)');
  }

  const hasRelationships = /\b(relationship|linked|associated|parent|child)\b/i.test(content);
  if (!hasRelationships) {
    result.recommendations.push('Define entity relationships in CRM model');
  }

  return result;
}

function evaluateLifecycle(sd, venture) {
  const result = { score: 6, recommendations: [] };
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  const hasLifecycle = /\b(lifecycle|stage|mql|sql|funnel)\b/i.test(content);
  if (!hasLifecycle) {
    result.score -= 1;
    result.recommendations.push('Define customer lifecycle stages');
  }

  const hasScoring = /\b(score|scoring|qualification|priority)\b/i.test(content);
  if (!hasScoring) {
    result.recommendations.push('Implement lead scoring model');
  }

  return result;
}

function evaluateAutomation(sd, venture) {
  const result = { score: 6, recommendations: [] };
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  const hasAutomation = /\b(automat|workflow|trigger|sequence|nurture)\b/i.test(content);
  if (!hasAutomation) {
    result.score -= 1;
    result.recommendations.push('Define CRM automation workflows');
  }

  const hasNurture = /\b(nurture|drip|email sequence|follow-up)\b/i.test(content);
  if (!hasNurture) {
    result.recommendations.push('Create lead nurture sequences');
  }

  return result;
}

function evaluateIntegration(sd, venture) {
  const result = { score: 6, recommendations: [] };
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  const hasIntegration = /\b(integrat|sync|connect|api|webhook)\b/i.test(content);
  if (!hasIntegration) {
    result.recommendations.push('Plan CRM integrations (email, calendar, etc.)');
  }

  const hasAnalytics = /\b(report|dashboard|analytic|metric)\b/i.test(content);
  if (!hasAnalytics) {
    result.recommendations.push('Define CRM reporting and dashboards');
  }

  return result;
}

function generateCRMArtifact({ venture, sd, scores }) {
  const content = `# CRM Architecture - ${venture?.name || sd.title}

## Customer Lifecycle Stages
${LIFECYCLE_STAGES.map(s => `- ${s.name}: ${s.description}`).join('\n')}

## Core Entities
${CRM_ENTITIES.map(e => `- ${e}`).join('\n')}

## Quality Scores
- Data Model: ${scores.data_model_score}/10
- Lifecycle: ${scores.lifecycle_score}/10
- Automation: ${scores.automation_score}/10
- Integration: ${scores.integration_score}/10

Generated: ${new Date().toISOString()}
`;

  return {
    type: 'crm_architecture',
    content,
    generated_at: new Date().toISOString(),
    stage: 12,
    sd_id: sd.id
  };
}

export default { execute };
