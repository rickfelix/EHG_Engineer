#!/usr/bin/env node
/**
 * LEO Protocol Compliance Score Tracker v2 - TYPE-AGNOSTIC
 *
 * Dynamically calculates compliance based on SD type requirements:
 * - Handoff count adjusted per type
 * - PRD requirement adjusted per type
 * - Sub-agent requirements adjusted per type
 * - Gate thresholds adjusted per type
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// SD Type Requirements (from CLAUDE_CORE.md and field reference)
const SD_TYPE_REQUIREMENTS = {
  feature: {
    prdRequired: true,
    minHandoffs: 4,
    gateThreshold: 85,
    requiredSubAgents: ['RISK', 'VALIDATION', 'STORIES'],
    testingLevel: 'comprehensive',
    e2eRequired: true
  },
  infrastructure: {
    prdRequired: true,
    minHandoffs: 3,
    gateThreshold: 80,
    requiredSubAgents: ['RISK', 'GITHUB', 'REGRESSION'],
    testingLevel: 'comprehensive',
    e2eRequired: false
  },
  enhancement: {
    prdRequired: false, // Optional
    minHandoffs: 2,
    gateThreshold: 75,
    requiredSubAgents: ['VALIDATION'],
    testingLevel: 'standard',
    e2eRequired: false
  },
  fix: {
    prdRequired: false,
    minHandoffs: 1,
    gateThreshold: 70,
    requiredSubAgents: ['RCA'],
    testingLevel: 'regression',
    e2eRequired: false
  },
  bugfix: {
    prdRequired: false,
    minHandoffs: 1,
    gateThreshold: 70,
    requiredSubAgents: ['RCA'],
    testingLevel: 'regression',
    e2eRequired: false
  },
  documentation: {
    prdRequired: false,
    minHandoffs: 1,
    gateThreshold: 60,
    requiredSubAgents: ['DOCMON'],
    testingLevel: 'minimal',
    e2eRequired: false
  },
  refactor: {
    prdRequired: true,
    minHandoffs: 3,
    gateThreshold: 80,
    requiredSubAgents: ['REGRESSION', 'VALIDATION'],
    testingLevel: 'comprehensive',
    e2eRequired: true
  },
  database: {
    prdRequired: true,
    minHandoffs: 4,
    gateThreshold: 85,
    requiredSubAgents: ['DATABASE', 'SECURITY'],
    testingLevel: 'comprehensive',
    e2eRequired: true
  },
  security: {
    prdRequired: true,
    minHandoffs: 4,
    gateThreshold: 90,
    requiredSubAgents: ['SECURITY', 'RISK'],
    testingLevel: 'comprehensive',
    e2eRequired: true
  },
  orchestrator: {
    prdRequired: true,
    minHandoffs: 4,
    gateThreshold: 85,
    requiredSubAgents: ['VALIDATION'],
    testingLevel: 'comprehensive',
    e2eRequired: false
  },
  performance: {
    prdRequired: false, // Optional
    minHandoffs: 2,
    gateThreshold: 75,
    requiredSubAgents: ['PERFORMANCE'],
    testingLevel: 'standard',
    e2eRequired: false
  },
  library: {
    prdRequired: false, // Optional
    minHandoffs: 2,
    gateThreshold: 75,
    requiredSubAgents: ['DEPENDENCY'],
    testingLevel: 'standard',
    e2eRequired: false
  }
};

// Default for unknown types
const DEFAULT_REQUIREMENTS = {
  prdRequired: true,
  minHandoffs: 3,
  gateThreshold: 80,
  requiredSubAgents: ['VALIDATION'],
  testingLevel: 'standard',
  e2eRequired: false
};

function getTypeRequirements(sdType) {
  return SD_TYPE_REQUIREMENTS[sdType?.toLowerCase()] || DEFAULT_REQUIREMENTS;
}

async function calculateComplianceScore(orchestratorId) {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('    LEO PROTOCOL COMPLIANCE SCORE v2 (TYPE-AGNOSTIC)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Get orchestrator or use provided ID
  const targetId = orchestratorId || process.argv[2] || 'SD-LEO-REFAC-COMPLIANCE-EXP-001';

  // Check if it's an orchestrator with children, or a single SD
  const { data: children, error: _childError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, current_phase, progress_percentage, sd_type')
    .eq('parent_sd_id', targetId)
    .order('id');

  let sdsToScore = [];

  if (children && children.length > 0) {
    console.log(`📊 Orchestrator: ${targetId}`);
    console.log(`📊 Children: ${children.length}`);
    sdsToScore = children;
  } else {
    // Single SD
    const { data: singleSD } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, current_phase, progress_percentage, sd_type')
      .eq('id', targetId)
      .single();

    if (singleSD) {
      console.log(`📊 Single SD: ${targetId}`);
      sdsToScore = [singleSD];
    } else {
      console.error(`❌ SD not found: ${targetId}`);
      return;
    }
  }

  console.log('');

  const scores = [];

  for (const sd of sdsToScore) {
    const score = await calculateSDScore(sd);
    scores.push(score);
  }

  // Print individual scores
  console.log('───────────────────────────────────────────────────────────────');
  console.log('INDIVIDUAL SCORES (Type-Adjusted)');
  console.log('───────────────────────────────────────────────────────────────');
  console.log('');

  for (const score of scores) {
    const rating = getScoreRating(score.total);
    const bar = '█'.repeat(Math.floor(score.total / 5)) + '░'.repeat(20 - Math.floor(score.total / 5));

    console.log(`${score.id} [${score.sdType}]`);
    console.log(`  ${bar} ${score.total.toFixed(1)}/100 (${rating})`);
    console.log(`  ├─ Protocol Files: ${score.protocolFiles.toFixed(1)}/20`);
    console.log(`  ├─ Handoffs: ${score.handoffs.toFixed(1)}/25 (${score.handoffCount}/${score.requiredHandoffs} req)`);
    console.log(`  ├─ Context: ${score.context.toFixed(1)}/20`);
    console.log(`  ├─ Sub-Agents: ${score.subAgents.toFixed(1)}/20 (${score.subAgentCount}/${score.requiredSubAgentCount} req)`);
    console.log(`  └─ Workflow: ${score.workflow.toFixed(1)}/15 (PRD: ${score.hasPRD ? '✓' : score.prdRequired ? '✗' : 'n/a'})`);
    console.log('');
  }

  // Calculate aggregate metrics
  const avgScore = scores.reduce((sum, s) => sum + s.total, 0) / scores.length;
  const passing = scores.filter(s => s.total >= s.typeGateThreshold).length;
  const totalHandoffs = scores.reduce((sum, s) => sum + s.handoffCount, 0);
  const expectedHandoffs = scores.reduce((sum, s) => sum + s.requiredHandoffs, 0);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('AGGREGATE METRICS (Type-Aware)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`  Average Compliance Score: ${avgScore.toFixed(1)}/100 (${getScoreRating(avgScore)})`);
  console.log(`  SDs Meeting Type Threshold: ${passing}/${sdsToScore.length}`);
  console.log(`  Total Handoffs: ${totalHandoffs}/${expectedHandoffs} expected`);
  console.log('');

  // Type distribution
  const typeDistribution = {};
  for (const s of scores) {
    typeDistribution[s.sdType] = (typeDistribution[s.sdType] || 0) + 1;
  }
  console.log('  Type Distribution:');
  for (const [type, count] of Object.entries(typeDistribution)) {
    const req = getTypeRequirements(type);
    console.log(`    ${type}: ${count} (gate: ${req.gateThreshold}%, handoffs: ${req.minHandoffs})`);
  }

  console.log('');
  console.log('───────────────────────────────────────────────────────────────');
  console.log('TARGET VALIDATION');
  console.log('───────────────────────────────────────────────────────────────');
  console.log('');

  // Dynamic targets based on type mix
  const avgRequiredThreshold = scores.reduce((sum, s) => sum + s.typeGateThreshold, 0) / scores.length;

  const targets = [
    {
      name: `Avg score ≥ avg type threshold (${avgRequiredThreshold.toFixed(0)}%)`,
      target: avgRequiredThreshold,
      actual: avgScore,
      pass: avgScore >= avgRequiredThreshold
    },
    {
      name: 'All SDs meet their type threshold',
      target: sdsToScore.length,
      actual: passing,
      pass: passing === sdsToScore.length
    },
    {
      name: `Handoffs ≥ type requirements (${expectedHandoffs})`,
      target: expectedHandoffs,
      actual: totalHandoffs,
      pass: totalHandoffs >= expectedHandoffs
    }
  ];

  for (const t of targets) {
    const status = t.pass ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status} ${t.name}: ${typeof t.actual === 'number' && t.actual % 1 !== 0 ? t.actual.toFixed(1) : t.actual}`);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');

  // Save report
  const report = {
    version: '2.0',
    timestamp: new Date().toISOString(),
    target: targetId,
    sdCount: sdsToScore.length,
    typeDistribution,
    scores: scores.map(s => ({
      id: s.id,
      sdType: s.sdType,
      total: s.total,
      typeThreshold: s.typeGateThreshold,
      passing: s.total >= s.typeGateThreshold,
      breakdown: {
        protocolFiles: s.protocolFiles,
        handoffs: s.handoffs,
        context: s.context,
        subAgents: s.subAgents,
        workflow: s.workflow
      }
    })),
    aggregate: {
      averageScore: avgScore,
      passingCount: passing,
      totalHandoffs,
      expectedHandoffs,
      avgTypeThreshold: avgRequiredThreshold
    },
    targets
  };

  const reportPath = path.join(process.cwd(), 'docs', 'experiments', 'compliance-score-report-v2.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📄 Report saved: ${reportPath}`);
  console.log('');
}

async function calculateSDScore(sd) {
  const sdType = sd.sd_type || 'feature';
  const requirements = getTypeRequirements(sdType);

  const score = {
    id: sd.id,
    title: sd.title,
    status: sd.status,
    sdType,
    typeGateThreshold: requirements.gateThreshold,
    requiredHandoffs: requirements.minHandoffs,
    prdRequired: requirements.prdRequired,
    requiredSubAgents: requirements.requiredSubAgents,
    requiredSubAgentCount: requirements.requiredSubAgents.length,
    protocolFiles: 0,
    handoffs: 0,
    context: 0,
    subAgents: 0,
    workflow: 0,
    total: 0,
    handoffCount: 0,
    subAgentCount: 0,
    hasPRD: false
  };

  // 1. Protocol Files (20 points) - Check phase progression as proxy
  const phaseProgress = sd.current_phase || 'LEAD_APPROVAL';
  const phasesCompleted = getPhasesCompleted(phaseProgress);
  // 5 points per phase file that should have been read
  score.protocolFiles = Math.min(phasesCompleted * 5, 20);

  // 2. Handoffs (25 points) - Scaled to type requirements
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('from_phase, to_phase, status, created_by')
    .eq('sd_id', sd.id);

  score.handoffCount = handoffs?.length || 0;
  const validHandoffs = handoffs?.filter(h => h.created_by === 'UNIFIED-HANDOFF-SYSTEM').length || 0;

  // Points per handoff = 25 / required handoffs
  const pointsPerHandoff = 25 / requirements.minHandoffs;
  score.handoffs = Math.min(validHandoffs * pointsPerHandoff, 25);

  // 3. Context Continuity (20 points)
  if (sd.status === 'completed' && sd.progress_percentage === 100) {
    score.context = 20;
  } else if (sd.progress_percentage > 0) {
    score.context = Math.min(Math.floor(sd.progress_percentage / 5), 20);
  }

  // 4. Sub-Agent Invocation (20 points) - Scaled to type requirements
  const { data: subAgentResults } = await supabase
    .from('sub_agent_execution_results')
    .select('sub_agent_type')
    .eq('sd_id', sd.id);

  score.subAgentCount = subAgentResults?.length || 0;

  // Check if required sub-agents were invoked
  const invokedTypes = new Set(subAgentResults?.map(r => r.sub_agent_type?.toUpperCase()) || []);
  const requiredMet = requirements.requiredSubAgents.filter(r => invokedTypes.has(r)).length;

  // Points per required sub-agent = 20 / required count
  const pointsPerSubAgent = requirements.requiredSubAgents.length > 0
    ? 20 / requirements.requiredSubAgents.length
    : 20;
  score.subAgents = Math.min(requiredMet * pointsPerSubAgent, 20);

  // 5. Workflow Integrity (15 points)
  const { data: prds } = await supabase
    .from('product_requirements_v2')
    .select('prd_id')
    .eq('sd_id', sd.id);

  score.hasPRD = prds?.length > 0;

  // PRD points (5) - only if required
  if (requirements.prdRequired) {
    if (score.hasPRD) score.workflow += 5;
  } else {
    score.workflow += 5; // Not required, full points
  }

  // Gate threshold met (5) - based on handoff completion ratio
  const handoffRatio = score.handoffCount / requirements.minHandoffs;
  if (handoffRatio >= 1) score.workflow += 5;

  // Evidence collected (5)
  const { data: evidence } = await supabase
    .from('validation_evidence')
    .select('id')
    .eq('sd_id', sd.id);

  if (evidence?.length > 0) score.workflow += 5;

  // Calculate total
  score.total = score.protocolFiles + score.handoffs + score.context + score.subAgents + score.workflow;

  return score;
}

function getPhasesCompleted(currentPhase) {
  const phases = ['LEAD_APPROVAL', 'PLAN_PRD', 'EXEC_IMPLEMENTATION', 'PLAN_VERIFY', 'LEAD_FINAL_APPROVAL', 'completed'];
  const index = phases.indexOf(currentPhase);
  return index >= 0 ? index : 0;
}

function getScoreRating(score) {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 70) return 'Fair';
  if (score >= 60) return 'Poor';
  return 'Critical';
}

// Run
const orchestratorId = process.argv[2];
calculateComplianceScore(orchestratorId).catch(console.error);
