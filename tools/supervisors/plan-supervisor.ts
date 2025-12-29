#!/usr/bin/env node

/**
 * PLAN Supervisor Verification
 *
 * Final "done done" verification by querying all sub-agents
 * Ensures all requirements are met before LEAD approval
 */

import { createClient } from '@supabase/supabase-js';
import { Agent, Gate } from '../../lib/validation/leo-schemas';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface SubAgentResult {
  agent: Agent;
  status: 'pass' | 'fail' | 'error' | 'timeout';
  evidence: Record<string, unknown>;
  message?: string;
  completedAt: string;
}

interface GateResult {
  gate: Gate;
  score: number;
  passed: boolean;
  evidence: Record<string, unknown>;
}

interface SupervisorVerdict {
  verdict: 'PASS' | 'FAIL' | 'CONDITIONAL_PASS' | 'ESCALATE';
  confidence: number;
  subAgentResults: SubAgentResult[];
  gateResults: GateResult[];
  conflicts: string[];
  recommendations: string[];
  summary: string;
}

/**
 * Priority-based conflict resolution
 * Security > Database > Testing > Performance > Design
 * Kept for future use in conflict resolution logic
 */
const _AGENT_PRIORITY: Record<Agent, number> = {
  SECURITY: 5,
  DATABASE: 4,
  TESTING: 3,
  PERFORMANCE: 2,
  DESIGN: 1
};
void _AGENT_PRIORITY; // Will be used for conflict resolution

/**
 * Query all sub-agent results for a PRD
 */
async function querySubAgents(prdId: string): Promise<SubAgentResult[]> {
  const { data, error } = await supabase
    .from('sub_agent_executions')
    .select(`
      sub_agent_id,
      status,
      results,
      completed_at,
      error_message,
      sub_agent:leo_sub_agents(code, name)
    `)
    .eq('prd_id', prdId)
    .in('status', ['pass', 'fail', 'error', 'timeout']);

  if (error) {
    throw new Error(`Failed to query sub-agents: ${error.message}`);
  }

  return (data || []).map(execution => ({
    agent: execution.sub_agent?.code as Agent,
    status: execution.status as 'pass' | 'fail' | 'error' | 'timeout',
    evidence: execution.results || {},
    message: execution.error_message,
    completedAt: execution.completed_at
  }));
}

/**
 * Query all gate results for a PRD
 */
async function queryGates(prdId: string): Promise<GateResult[]> {
  const gates: Gate[] = ['2A', '2B', '2C', '2D', '3'];
  const results: GateResult[] = [];

  for (const gate of gates) {
    const { data } = await supabase
      .from('leo_gate_reviews')
      .select('score, evidence')
      .eq('prd_id', prdId)
      .eq('gate', gate)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (data) {
      results.push({
        gate,
        score: Number(data.score),
        passed: Number(data.score) >= 85,
        evidence: data.evidence || {}
      });
    } else {
      // Gate not yet validated
      results.push({
        gate,
        score: 0,
        passed: false,
        evidence: {}
      });
    }
  }

  return results;
}

/**
 * Detect conflicts between sub-agent reports
 */
function detectConflicts(subAgentResults: SubAgentResult[]): string[] {
  const conflicts: string[] = [];

  // Check for contradictory security/performance requirements
  const security = subAgentResults.find(r => r.agent === 'SECURITY');
  const performance = subAgentResults.find(r => r.agent === 'PERFORMANCE');

  if (security?.status === 'pass' && performance?.status === 'fail') {
    if (security.evidence.requires_encryption && performance.evidence.latency_exceeded) {
      conflicts.push('Security encryption requirements conflict with performance latency targets');
    }
  }

  // Check for database/design misalignment
  const database = subAgentResults.find(r => r.agent === 'DATABASE');
  const design = subAgentResults.find(r => r.agent === 'DESIGN');

  if (database?.status === 'pass' && design?.status === 'fail') {
    if (database.evidence.schema_ready && !design.evidence.wireframes_complete) {
      conflicts.push('Database schema ready but design wireframes incomplete');
    }
  }

  // Check for testing coverage gaps
  const testing = subAgentResults.find(r => r.agent === 'TESTING');
  if (testing?.status === 'fail' && testing.evidence.coverage_percent < 80) {
    conflicts.push(`Test coverage at ${testing.evidence.coverage_percent}%, below 80% requirement`);
  }

  return conflicts;
}

/**
 * Generate recommendations based on results
 */
function generateRecommendations(
  subAgentResults: SubAgentResult[],
  gateResults: GateResult[]
): string[] {
  const recommendations: string[] = [];

  // Check failed sub-agents
  const failedAgents = subAgentResults.filter(r => r.status === 'fail');
  for (const agent of failedAgents) {
    switch (agent.agent) {
      case 'SECURITY':
        recommendations.push('Address security vulnerabilities before proceeding');
        break;
      case 'DATABASE':
        recommendations.push('Complete database migrations and schema validation');
        break;
      case 'TESTING':
        recommendations.push('Increase test coverage to meet 80% requirement');
        break;
      case 'PERFORMANCE':
        recommendations.push('Optimize performance to meet p95 latency targets');
        break;
      case 'DESIGN':
        recommendations.push('Complete design artifacts and accessibility review');
        break;
    }
  }

  // Check failed gates
  const failedGates = gateResults.filter(g => !g.passed);
  for (const gate of failedGates) {
    if (gate.gate === '2A') {
      recommendations.push('Create Architecture Decision Records (ADRs)');
    }
    if (gate.gate === '2B') {
      recommendations.push('Complete design wireframes and database schema');
    }
    if (gate.gate === '2C') {
      recommendations.push('Run security scans and close risk spikes');
    }
    if (gate.gate === '2D') {
      recommendations.push('Define NFR budgets and test matrices');
    }
  }

  return recommendations;
}

/**
 * Calculate confidence score
 */
function calculateConfidence(
  subAgentResults: SubAgentResult[],
  gateResults: GateResult[]
): number {
  const subAgentScore = subAgentResults.filter(r => r.status === 'pass').length /
                        Math.max(subAgentResults.length, 1);

  const gateScore = gateResults.filter(g => g.passed).length / gateResults.length;

  // Weighted average: gates more important than sub-agents
  return Math.round((gateScore * 0.7 + subAgentScore * 0.3) * 100);
}

/**
 * Determine final verdict
 */
function determineVerdict(
  confidence: number,
  conflicts: string[],
  subAgentResults: SubAgentResult[],
  gateResults: GateResult[]
): SupervisorVerdict['verdict'] {
  // Check for critical failures
  const securityFailed = subAgentResults.find(r => r.agent === 'SECURITY')?.status === 'fail';
  const gate3Failed = gateResults.find(g => g.gate === '3')?.passed === false;

  if (securityFailed || gate3Failed) {
    return 'FAIL';
  }

  // Check confidence and conflicts
  if (confidence >= 85 && conflicts.length === 0) {
    return 'PASS';
  }

  if (confidence >= 70 && conflicts.length <= 2) {
    return 'CONDITIONAL_PASS';
  }

  if (conflicts.length > 3) {
    return 'ESCALATE';
  }

  return 'FAIL';
}

/**
 * Main supervisor verification
 */
export async function supervisorVerify(
  prdId: string,
  maxIterations: number = 3
): Promise<SupervisorVerdict> {
  console.log(`🔍 PLAN Supervisor Verification for ${prdId}`);
  console.log('='.repeat(60));

  let iteration = 0;
  let verdict: SupervisorVerdict | null = null;

  while (iteration < maxIterations) {
    iteration++;
    console.log(`\n📍 Iteration ${iteration}/${maxIterations}`);

    try {
      // Query all results (read-only)
      const subAgentResults = await querySubAgents(prdId);
      const gateResults = await queryGates(prdId);

      console.log(`  ✓ Found ${subAgentResults.length} sub-agent results`);
      console.log(`  ✓ Found ${gateResults.filter(g => g.score > 0).length} gate reviews`);

      // Analyze results
      const conflicts = detectConflicts(subAgentResults);
      const recommendations = generateRecommendations(subAgentResults, gateResults);
      const confidence = calculateConfidence(subAgentResults, gateResults);
      const finalVerdict = determineVerdict(confidence, conflicts, subAgentResults, gateResults);

      verdict = {
        verdict: finalVerdict,
        confidence,
        subAgentResults,
        gateResults,
        conflicts,
        recommendations,
        summary: generateSummary(finalVerdict, confidence, conflicts.length)
      };

      // If we have high confidence or clear failure, stop iterating
      if (confidence >= 85 || finalVerdict === 'FAIL') {
        break;
      }

      // Resolve conflicts if possible
      if (conflicts.length > 0 && iteration < maxIterations) {
        console.log(`  ⚠️  Found ${conflicts.length} conflicts, attempting resolution...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause
      }

    } catch (error) {
      console.error(`  ❌ Iteration ${iteration} failed:`, error);

      // Circuit breaker
      if (iteration >= 2) {
        verdict = {
          verdict: 'ESCALATE',
          confidence: 0,
          subAgentResults: [],
          gateResults: [],
          conflicts: ['Supervisor verification failed after multiple attempts'],
          recommendations: ['Manual review required by LEAD agent'],
          summary: 'Supervisor verification failed - escalating to LEAD'
        };
        break;
      }
    }
  }

  if (!verdict) {
    throw new Error('Supervisor verification failed to produce a verdict');
  }

  // Store verification result
  await storeVerificationResult(prdId, verdict);

  // Display results
  displayVerdict(verdict);

  return verdict;
}

/**
 * Generate human-readable summary
 */
function generateSummary(
  verdict: SupervisorVerdict['verdict'],
  confidence: number,
  conflictCount: number
): string {
  switch (verdict) {
    case 'PASS':
      return `All requirements met with ${confidence}% confidence. Ready for implementation.`;
    case 'FAIL':
      return `Critical requirements not met. ${conflictCount} conflicts need resolution.`;
    case 'CONDITIONAL_PASS':
      return `Most requirements met (${confidence}% confidence) with ${conflictCount} minor issues.`;
    case 'ESCALATE':
      return `Unable to reach consensus. ${conflictCount} conflicts require LEAD intervention.`;
  }
}

/**
 * Store verification result in database
 */
async function storeVerificationResult(
  prdId: string,
  verdict: SupervisorVerdict
): Promise<void> {
  await supabase.from('compliance_alerts').insert({
    alert_type: verdict.verdict === 'PASS' ? 'missing_artifact' : 'gate_failure',
    severity: verdict.verdict === 'FAIL' ? 'error' : 'info',
    source: 'plan-supervisor',
    message: `PLAN Supervisor: ${verdict.verdict} for PRD ${prdId}`,
    payload: {
      prd_id: prdId,
      verdict: verdict.verdict,
      confidence: verdict.confidence,
      conflicts: verdict.conflicts,
      recommendations: verdict.recommendations,
      timestamp: new Date().toISOString()
    },
    resolved: verdict.verdict === 'PASS'
  });
}

/**
 * Display verification verdict
 */
function displayVerdict(verdict: SupervisorVerdict): void {
  console.log('\n' + '='.repeat(60));
  console.log('📊 PLAN SUPERVISOR VERDICT');
  console.log('='.repeat(60));

  const verdictEmoji = {
    PASS: '✅',
    FAIL: '❌',
    CONDITIONAL_PASS: '⚠️',
    ESCALATE: '🚨'
  }[verdict.verdict];

  console.log(`\n${verdictEmoji} Verdict: ${verdict.verdict}`);
  console.log(`📈 Confidence: ${verdict.confidence}%`);
  console.log(`📝 Summary: ${verdict.summary}`);

  if (verdict.conflicts.length > 0) {
    console.log('\n⚡ Conflicts Detected:');
    verdict.conflicts.forEach(c => console.log(`  - ${c}`));
  }

  if (verdict.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    verdict.recommendations.forEach(r => console.log(`  - ${r}`));
  }

  console.log('\n📋 Gate Status:');
  verdict.gateResults.forEach(g => {
    const icon = g.passed ? '✓' : '✗';
    console.log(`  ${icon} Gate ${g.gate}: ${g.score}%`);
  });

  console.log('\n🤖 Sub-Agent Status:');
  verdict.subAgentResults.forEach(s => {
    const icon = s.status === 'pass' ? '✓' : '✗';
    console.log(`  ${icon} ${s.agent}: ${s.status}`);
  });
}

// CLI interface
import { fileURLToPath } from 'url';
const __filename_supervisor = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename_supervisor) {
  const prdId = process.argv[2] || process.env.PRD_ID;

  if (!prdId) {
    console.error('Usage: plan-supervisor.ts <PRD_ID>');
    console.error('   or: PRD_ID=PRD-SD-001 npx tsx plan-supervisor.ts');
    process.exit(1);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
  }

  supervisorVerify(prdId)
    .then(verdict => {
      process.exit(verdict.verdict === 'PASS' ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Supervisor verification failed:', error);
      process.exit(1);
    });
}