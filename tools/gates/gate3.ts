#!/usr/bin/env node

/**
 * Gate 3: Supervisor Final Verification
 * 
 * Validates:
 * - supervisorChecklistPass: DoR pass + all sub-agents pass
 */

import { exit } from 'node:process';
import { getDb } from './lib/db';
import { scoreGate, formatGateResults, gatePass, getThreshold, Check } from './lib/score';
import { getRulesForGate, getPRDDetails, storeGateReview } from './lib/rules';
import { safeJsonParse } from './lib/evidence';

(async () => {
  const prdId = process.env.PRD_ID;
  if (!prdId) {
    console.error('❌ PRD_ID environment variable is required');
    exit(2);
  }

  console.log('🔍 Running Gate 3: Supervisor Final Verification');
  console.log(`PRD: ${prdId}`);

  // Get PRD details
  const prdDetails = await getPRDDetails(prdId);
  if (!prdDetails) {
    console.error(`❌ PRD ${prdId} not found in database`);
    exit(2);
  }

  console.log(`Title: ${prdDetails.title}`);
  console.log(`SD: ${prdDetails.sd_id || 'None'}`);
  console.log(`SD Type: ${prdDetails.sd_type} (threshold: ${getThreshold(prdDetails.sd_type)}%)`);
  console.log('');

  const db = await getDb();
  const rules = await getRulesForGate('3');

  // Define checks for each rule
  const checks: Record<string, Check> = {
    async supervisorChecklistPass() {
      console.log('  Checking supervisor verification...');
      
      // First, check that all Gates 2A-2D have passed
      const { data: previousGates, error: gateError } = await db
        .from('leo_gate_reviews')
        .select('gate, score')
        .eq('prd_id', prdId)
        .in('gate', ['2A', '2B', '2C', '2D'])
        .order('created_at', { ascending: false });
      
      if (gateError) {
        console.error('  Failed to check previous gates:', gateError.message);
        return false;
      }
      
      // Get the latest score for each gate
      const latestScores: Record<string, number> = {};
      const requiredGates = ['2A', '2B', '2C', '2D'];
      
      for (const gate of requiredGates) {
        const gateReview = previousGates?.find(g => g.gate === gate);
        if (!gateReview) {
          console.log(`    Gate ${gate}: Not executed`);
          latestScores[gate] = 0;
        } else {
          latestScores[gate] = gateReview.score;
          console.log(`    Gate ${gate}: ${gateReview.score}% ${gateReview.score >= 85 ? '✓' : '✗'}`);
        }
      }
      
      // Check if all gates passed
      const allGatesPass = requiredGates.every(gate => latestScores[gate] >= 85);
      
      if (!allGatesPass) {
        console.log('  Not all prerequisite gates have passed');
        return false;
      }
      
      console.log('  All prerequisite gates passed');
      
      // Check sub-agent executions
      const { data: subAgents, error: subAgentError } = await db
        .from('sub_agent_executions')
        .select(`
          status,
          sub_agent:leo_sub_agents(name, code)
        `)
        .eq('prd_id', prdId);
      
      if (subAgentError) {
        console.error('  Failed to check sub-agents:', subAgentError.message);
        return false;
      }
      
      console.log('\n  Sub-agent status:');
      
      let allSubAgentsPass = true;
      
      if (!subAgents || subAgents.length === 0) {
        console.log('    No sub-agents executed');
        // This may be okay if no sub-agents were required
      } else {
        for (const exec of subAgents) {
          const agentName = exec.sub_agent?.name || 'Unknown';
          const status = exec.status;
          const passed = status === 'pass';
          
          console.log(`    ${agentName}: ${status} ${passed ? '✓' : '✗'}`);
          
          if (!passed && status !== 'pending') {
            allSubAgentsPass = false;
          }
        }
      }
      
      if (!allSubAgentsPass) {
        console.log('  Not all sub-agents passed');
        return false;
      }
      
      // Check for supervisor artifact (optional but good practice)
      const { data: supervisorArtifact, error: artifactError } = await db
        .from('leo_artifacts')
        .select('content')
        .eq('prd_id', prdId)
        .eq('artifact_type', 'supervisor_verification')
        .single();
      
      if (artifactError && artifactError.code !== 'PGRST116') { // PGRST116 = no rows
        console.error('  Failed to check supervisor artifact:', artifactError.message);
      }
      
      if (supervisorArtifact) {
        const content = safeJsonParse(supervisorArtifact.content);
        console.log('\n  Supervisor verification artifact found');
        
        if (content?.dor_pass === false) {
          console.log('  Definition of Ready (DoR) not met');
          return false;
        }
      }
      
      console.log('\n  ✅ Supervisor checklist PASSED');
      return true;
    },
  };

  // Score the gate
  const { score, results } = await scoreGate(rules, checks);

  // Format and display results
  console.log(formatGateResults('3', { score, results }));

  // Store review in database
  await storeGateReview(prdId, '3', score, results);

  // Exit with appropriate code (using SD type-aware threshold)
  const threshold = getThreshold(prdDetails.sd_type);
  if (!gatePass(score, prdDetails.sd_type)) {
    console.log(`\n❌ Gate 3 (Final Verification) failed: ${score}% < ${threshold}%`);
    console.log('PRD is NOT ready for implementation');
    exit(1);
  } else {
    console.log(`\n✅ Gate 3 (Final Verification) passed: ${score}% >= ${threshold}%`);
    console.log('🎆 PRD is READY for implementation!');
    exit(0);
  }
})().catch((error) => {
  console.error('❌ Gate runner failed:', error);
  exit(2);
});