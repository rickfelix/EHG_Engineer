#!/usr/bin/env node
/**
 * LEO Protocol Compliance Score Tracker
 *
 * Calculates compliance scores for experiment children based on:
 * 1. Protocol File Reading (20 points)
 * 2. Handoff Execution (25 points)
 * 3. Context Continuity (20 points)
 * 4. Sub-Agent Invocation (20 points)
 * 5. Workflow Integrity (15 points)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ORCHESTRATOR_ID = 'SD-LEO-REFAC-COMPLIANCE-EXP-001';

async function calculateComplianceScore() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('    LEO PROTOCOL COMPLIANCE SCORE REPORT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Get all children
  const { data: children, error: childError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, current_phase, progress_percentage')
    .eq('parent_sd_id', ORCHESTRATOR_ID)
    .order('id');

  if (childError) {
    console.error('Error fetching children:', childError.message);
    return;
  }

  console.log(`📊 Experiment: ${ORCHESTRATOR_ID}`);
  console.log(`📊 Children: ${children.length}`);
  console.log('');

  const scores = [];

  for (const child of children) {
    const score = await calculateChildScore(child);
    scores.push(score);
  }

  // Print individual scores
  console.log('───────────────────────────────────────────────────────────────');
  console.log('INDIVIDUAL CHILD SCORES');
  console.log('───────────────────────────────────────────────────────────────');
  console.log('');

  for (const score of scores) {
    const rating = getScoreRating(score.total);
    const bar = '█'.repeat(Math.floor(score.total / 5)) + '░'.repeat(20 - Math.floor(score.total / 5));

    console.log(`${score.id}`);
    console.log(`  ${bar} ${score.total}/100 (${rating})`);
    console.log(`  ├─ Protocol Files: ${score.protocolFiles}/20`);
    console.log(`  ├─ Handoffs: ${score.handoffs}/25`);
    console.log(`  ├─ Context: ${score.context}/20`);
    console.log(`  ├─ Sub-Agents: ${score.subAgents}/20`);
    console.log(`  └─ Workflow: ${score.workflow}/15`);
    console.log('');
  }

  // Calculate aggregate metrics
  const avgScore = scores.reduce((sum, s) => sum + s.total, 0) / scores.length;
  const passing = scores.filter(s => s.total >= 80).length;
  const totalHandoffs = scores.reduce((sum, s) => sum + s.handoffCount, 0);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('AGGREGATE METRICS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`  Average Compliance Score: ${avgScore.toFixed(1)}/100 (${getScoreRating(avgScore)})`);
  console.log(`  Children Passing (≥80): ${passing}/${children.length}`);
  console.log(`  Total Handoffs Created: ${totalHandoffs}`);
  console.log('');

  // Check targets
  console.log('───────────────────────────────────────────────────────────────');
  console.log('TARGET VALIDATION');
  console.log('───────────────────────────────────────────────────────────────');
  console.log('');

  const targets = [
    { name: 'Average score ≥85', target: 85, actual: avgScore, pass: avgScore >= 85 },
    { name: 'All children ≥80', target: 10, actual: passing, pass: passing === 10 },
    { name: 'Total handoffs ≥40', target: 40, actual: totalHandoffs, pass: totalHandoffs >= 40 }
  ];

  for (const t of targets) {
    const status = t.pass ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status} ${t.name}: ${t.actual.toFixed ? t.actual.toFixed(1) : t.actual}`);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');

  // Save report to file
  const report = {
    timestamp: new Date().toISOString(),
    orchestrator: ORCHESTRATOR_ID,
    children: children.length,
    scores,
    aggregate: {
      averageScore: avgScore,
      passingCount: passing,
      totalHandoffs
    },
    targets
  };

  const reportPath = path.join(process.cwd(), 'docs', 'experiments', 'compliance-score-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📄 Report saved: ${reportPath}`);
  console.log('');
}

async function calculateChildScore(child) {
  const score = {
    id: child.id,
    title: child.title,
    status: child.status,
    protocolFiles: 0,
    handoffs: 0,
    context: 0,
    subAgents: 0,
    workflow: 0,
    total: 0,
    handoffCount: 0
  };

  // 1. Protocol Files (20 points) - Check via protocol_file_reads table or session logs
  // For now, estimate based on phase progression
  const phaseProgress = child.current_phase || 'LEAD_APPROVAL';
  if (['PLAN_PRD', 'EXEC_IMPLEMENTATION', 'PLAN_VERIFY', 'LEAD_FINAL_APPROVAL', 'completed'].includes(phaseProgress)) {
    score.protocolFiles = 20; // Assume files were read if progressed past LEAD
  } else if (phaseProgress !== 'LEAD_APPROVAL') {
    score.protocolFiles = 10;
  }

  // 2. Handoffs (25 points)
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('from_phase, to_phase, status, created_by')
    .eq('sd_id', child.id);

  score.handoffCount = handoffs?.length || 0;
  const validHandoffs = handoffs?.filter(h => h.created_by === 'UNIFIED-HANDOFF-SYSTEM').length || 0;
  score.handoffs = Math.min(validHandoffs * 6.25, 25); // 6.25 per handoff, max 25

  // 3. Context Continuity (20 points)
  // Check if SD state is consistent
  if (child.status === 'completed' && child.progress_percentage === 100) {
    score.context = 20;
  } else if (child.progress_percentage > 0) {
    score.context = Math.floor(child.progress_percentage / 5);
  }

  // 4. Sub-Agent Invocation (20 points)
  const { data: subAgentResults } = await supabase
    .from('sub_agent_execution_results')
    .select('sub_agent_type')
    .eq('sd_id', child.id);

  const subAgentCount = subAgentResults?.length || 0;
  score.subAgents = Math.min(subAgentCount * 10, 20); // 10 per sub-agent, max 20

  // 5. Workflow Integrity (15 points)
  const { data: prds } = await supabase
    .from('product_requirements_v2')
    .select('prd_id')
    .eq('sd_id', child.id);

  const hasPRD = prds?.length > 0;

  const { data: evidence } = await supabase
    .from('validation_evidence')
    .select('id')
    .eq('sd_id', child.id);

  const hasEvidence = evidence?.length > 0;

  if (hasPRD) score.workflow += 5;
  if (score.handoffs >= 18.75) score.workflow += 5; // 3+ handoffs = 80% gate threshold
  if (hasEvidence) score.workflow += 5;

  // Calculate total
  score.total = score.protocolFiles + score.handoffs + score.context + score.subAgents + score.workflow;

  return score;
}

function getScoreRating(score) {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 70) return 'Fair';
  if (score >= 60) return 'Poor';
  return 'Critical';
}

calculateComplianceScore().catch(console.error);
