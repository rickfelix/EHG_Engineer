#!/usr/bin/env node

/**
 * Gate 2B: Design & DB Interfaces
 * 
 * Validates:
 * - designArtifacts: WCAG2.1-AA compliance + wireframes
 * - dbSchemaReady: Migrations + schema snapshots
 */

import { exit } from 'node:process';
import { getDb } from './lib/db';
import { scoreGate, formatGateResults, gatePass, getThreshold, Check } from './lib/score';
import { getRulesForGate, getPRDDetails, storeGateReview } from './lib/rules';
import { meetsA11yLevel } from './lib/evidence';

(async () => {
  const prdId = process.env.PRD_ID;
  if (!prdId) {
    console.error('❌ PRD_ID environment variable is required');
    exit(2);
  }

  console.log('🔍 Running Gate 2B: Design & DB Interfaces');
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
  const rules = await getRulesForGate('2B');

  // Define checks for each rule
  const checks: Record<string, Check> = {
    async designArtifacts() {
      // Check for design artifacts with a11y compliance
      const { data: artifacts, error: artifactError } = await db
        .from('leo_artifacts')
        .select('artifact_type, content')
        .eq('prd_id', prdId)
        .in('artifact_type', ['design', 'wireframes', 'mockups']);
      
      if (artifactError) {
        console.error('  Failed to check design artifacts:', artifactError.message);
        return false;
      }
      
      const hasWireframes = artifacts?.some(a => 
        a.artifact_type === 'wireframes' || 
        (a.content && a.content.wireframes === true)
      );
      
      console.log(`  Wireframes: ${hasWireframes ? 'Found' : 'Missing'}`);
      
      // Check accessibility requirements
      const { data: nfrData, error: nfrError } = await db
        .from('leo_nfr_requirements')
        .select('a11y_level')
        .eq('prd_id', prdId)
        .single();
      
      if (nfrError && nfrError.code !== 'PGRST116') { // PGRST116 = no rows
        console.error('  Failed to check NFR requirements:', nfrError.message);
      }
      
      const a11yCompliant = meetsA11yLevel(nfrData?.a11y_level, 'WCAG2.1-AA');
      console.log(`  Accessibility: ${nfrData?.a11y_level || 'Not specified'} ${a11yCompliant ? '(≥ WCAG2.1-AA)' : '(< WCAG2.1-AA)'}`);
      
      // Both wireframes and a11y must be present
      return hasWireframes && a11yCompliant;
    },

    async dbSchemaReady() {
      // Check for database migrations
      const { data: migrations, error: migrationError } = await db
        .from('leo_artifacts')
        .select('id, artifact_name')
        .eq('prd_id', prdId)
        .eq('artifact_type', 'migration');
      
      if (migrationError) {
        console.error('  Failed to check migrations:', migrationError.message);
        return false;
      }
      
      const hasMigrations = (migrations?.length ?? 0) > 0;
      console.log(`  Migrations found: ${migrations?.length ?? 0}`);
      
      // Check for schema snapshots
      const { data: snapshots, error: snapshotError } = await db
        .from('leo_artifacts')
        .select('id, artifact_name')
        .eq('prd_id', prdId)
        .eq('artifact_type', 'schema_snapshot');
      
      if (snapshotError) {
        console.error('  Failed to check schema snapshots:', snapshotError.message);
        return false;
      }
      
      const hasSnapshots = (snapshots?.length ?? 0) > 0;
      console.log(`  Schema snapshots found: ${snapshots?.length ?? 0}`);
      
      // Both migrations and snapshots must be present
      return hasMigrations && hasSnapshots;
    },
  };

  // Score the gate
  const { score, results } = await scoreGate(rules, checks);

  // Format and display results (with SD type for threshold)
  console.log(formatGateResults('2B', { score, results }, prdDetails.sd_type));

  // Store review in database
  await storeGateReview(prdId, '2B', score, results);

  // Exit with appropriate code (using SD type-aware threshold)
  const threshold = getThreshold(prdDetails.sd_type);
  if (!gatePass(score, prdDetails.sd_type)) {
    console.log(`\n❌ Gate 2B failed: ${score}% < ${threshold}%`);
    exit(1);
  } else {
    console.log(`\n✅ Gate 2B passed: ${score}% >= ${threshold}%`);
    exit(0);
  }
})().catch((error) => {
  console.error('❌ Gate runner failed:', error);
  exit(2);
});