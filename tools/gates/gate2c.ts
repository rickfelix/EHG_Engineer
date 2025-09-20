#!/usr/bin/env node

/**
 * Gate 2C: Security & Risk
 * 
 * Validates:
 * - securityScanClean: OWASP clean + CSP configured
 * - riskSpikesClosed: ≥1 completed risk spike
 */

import { exit } from 'node:process';
import { getDb } from './lib/db';
import { scoreGate, formatGateResults, Check } from './lib/score';
import { getRulesForGate, getPRDDetails, storeGateReview } from './lib/rules';
import { isSecurityScanClean, safeJsonParse } from './lib/evidence';

(async () => {
  const prdId = process.env.PRD_ID;
  if (!prdId) {
    console.error('❌ PRD_ID environment variable is required');
    exit(2);
  }

  console.log('🔍 Running Gate 2C: Security & Risk');
  console.log(`PRD: ${prdId}`);

  // Get PRD details
  const prdDetails = await getPRDDetails(prdId);
  if (!prdDetails) {
    console.error(`❌ PRD ${prdId} not found in database`);
    exit(2);
  }

  console.log(`Title: ${prdDetails.title}`);
  console.log(`SD: ${prdDetails.sd_id || 'None'}`);
  console.log('');

  const db = await getDb();
  const rules = await getRulesForGate('2C');

  // Define checks for each rule
  const checks: Record<string, Check> = {
    async securityScanClean() {
      // Check security sub-agent execution results
      const { data: securityExec, error } = await db
        .from('sub_agent_executions')
        .select('status, results')
        .eq('prd_id', prdId)
        .eq('sub_agent_id', (await db
          .from('leo_sub_agents')
          .select('id')
          .eq('code', 'SECURITY')
          .single()
        ).data?.id)
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
        console.error('  Failed to check security sub-agent:', error.message);
        return false;
      }
      
      if (!securityExec) {
        console.log('  Security sub-agent not executed');
        return false;
      }
      
      console.log(`  Security sub-agent status: ${securityExec.status}`);
      
      if (securityExec.status !== 'pass') {
        console.log('  Security sub-agent did not pass');
        return false;
      }
      
      // Check scan results
      const results = safeJsonParse(securityExec.results);
      const scanClean = isSecurityScanClean(results);
      
      if (!scanClean) {
        console.log('  Security scan issues found');
      } else {
        console.log('  Security scan clean (OWASP: clean, CSP: configured)');
      }
      
      return scanClean;
    },

    async riskSpikesClosed() {
      // Check for completed risk spikes
      const { data: spikes, count, error } = await db
        .from('leo_risk_spikes')
        .select('risk_title, status', { count: 'exact' })
        .eq('prd_id', prdId)
        .in('status', ['completed', 'mitigated']);
      
      if (error) {
        console.error('  Failed to check risk spikes:', error.message);
        return false;
      }
      
      const completedCount = count ?? 0;
      console.log(`  Risk spikes completed/mitigated: ${completedCount}`);
      
      if (completedCount > 0 && spikes) {
        spikes.forEach(spike => {
          console.log(`    - ${spike.risk_title} (${spike.status})`);
        });
      }
      
      return completedCount >= 1;
    },
  };

  // Score the gate
  const { score, results } = await scoreGate(rules, checks);

  // Format and display results
  console.log(formatGateResults('2C', { score, results }));

  // Store review in database
  await storeGateReview(prdId, '2C', score, results);

  // Exit with appropriate code
  if (score < 85) {
    console.log(`\n❌ Gate 2C failed: ${score}% < 85%`);
    exit(1);
  } else {
    console.log(`\n✅ Gate 2C passed: ${score}%`);
    exit(0);
  }
})().catch((error) => {
  console.error('❌ Gate runner failed:', error);
  exit(2);
});