#!/usr/bin/env node

/**
 * Gate 2A: Architecture / Interfaces / Tech Design
 * 
 * Validates:
 * - hasADR: Architecture Decision Records exist
 * - hasInterfaces: OpenAPI/TypeScript specs that lint clean
 * - hasTechDesign: Technical design document exists
 */

import { exit } from 'node:process';
import { getDb } from './lib/db';
import { scoreGate, formatGateResults, Check } from './lib/score';
import { getRulesForGate, getPRDDetails, storeGateReview } from './lib/rules';
import { lintOpenAPI } from './lib/evidence';

(async () => {
  const prdId = process.env.PRD_ID;
  if (!prdId) {
    console.error('❌ PRD_ID environment variable is required');
    exit(2);
  }

  console.log('🔍 Running Gate 2A: Architecture / Interfaces / Tech Design');
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
  const rules = await getRulesForGate('2A');

  // Define checks for each rule
  const checks: Record<string, Check> = {
    async hasADR() {
      const { count, error } = await db
        .from('leo_adrs')
        .select('id', { count: 'exact', head: true })
        .eq('prd_id', prdId);
      
      if (error) {
        console.error('  Failed to check ADRs:', error.message);
        return false;
      }
      
      const hasADRs = (count ?? 0) > 0;
      console.log(`  ADRs found: ${count ?? 0}`);
      return hasADRs;
    },

    async hasInterfaces() {
      const { data, error } = await db
        .from('leo_interfaces')
        .select('id, name, kind, spec')
        .eq('prd_id', prdId)
        .in('kind', ['openapi', 'typescript']);
      
      if (error) {
        console.error('  Failed to check interfaces:', error.message);
        return false;
      }
      
      if (!data || data.length === 0) {
        console.log('  No OpenAPI/TypeScript interfaces found');
        return false;
      }
      
      console.log(`  Interfaces found: ${data.length}`);
      
      // If OpenAPI present, lint it
      const openApiSpec = data.find(d => d.kind === 'openapi');
      if (openApiSpec) {
        console.log('  Validating OpenAPI specification...');
        const isValid = await lintOpenAPI(openApiSpec.spec);
        if (!isValid) {
          console.log('  OpenAPI validation failed');
          return false;
        }
        console.log('  OpenAPI validation passed');
      }
      
      return true;
    },

    async hasTechDesign() {
      const { count, error } = await db
        .from('leo_artifacts')
        .select('id', { count: 'exact', head: true })
        .eq('prd_id', prdId)
        .eq('artifact_type', 'tech_design');
      
      if (error) {
        console.error('  Failed to check tech design:', error.message);
        return false;
      }
      
      const hasDesign = (count ?? 0) > 0;
      console.log(`  Tech design artifacts found: ${count ?? 0}`);
      return hasDesign;
    },
  };

  // Score the gate
  const { score, results } = await scoreGate(rules, checks);

  // Format and display results
  console.log(formatGateResults('2A', { score, results }));

  // Store review in database
  await storeGateReview(prdId, '2A', score, results);

  // Exit with appropriate code
  if (score < 85) {
    console.log(`\n❌ Gate 2A failed: ${score}% < 85%`);
    exit(1);
  } else {
    console.log(`\n✅ Gate 2A passed: ${score}%`);
    exit(0);
  }
})().catch((error) => {
  console.error('❌ Gate runner failed:', error);
  exit(2);
});