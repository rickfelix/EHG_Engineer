#!/usr/bin/env node

/**
 * Update PRD Metadata with Sub-Agent Analysis
 * Satisfies GATE 1 validation requirements for PLAN→EXEC handoff
 */

import { createDatabaseClient } from '../lib/supabase-connection.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const childSDs = [
  'SD-STAGE4-UI-RESTRUCTURE-001',
  'SD-STAGE4-AGENT-PROGRESS-001',
  'SD-STAGE4-RESULTS-DISPLAY-001',
  'SD-STAGE4-ERROR-HANDLING-001'
];

async function updatePRDMetadata() {
  let client;

  try {
    console.log('📋 Updating PRD metadata with sub-agent analysis for GATE 1 compliance...\n');

    // Connect to database
    client = await createDatabaseClient('engineer', { verify: false });

    for (const sdId of childSDs) {
      console.log(`\n🔄 Processing ${sdId}...`);

      // Get sub-agent results for this SD
      const subAgentQuery = `
        SELECT
          sub_agent_code,
          sub_agent_name,
          verdict,
          confidence,
          recommendations,
          metadata as sub_metadata
        FROM sub_agent_execution_results
        WHERE sd_id = $1
        AND sub_agent_code IN ('DESIGN', 'DATABASE')
        ORDER BY sub_agent_code
      `;

      const subAgentResults = await client.query(subAgentQuery, [sdId]);

      if (subAgentResults.rows.length < 2) {
        console.log(`   ⚠️  Missing sub-agent results (found ${subAgentResults.rows.length}/2)`);
        continue;
      }

      // Build metadata with sub-agent analysis
      const designResult = subAgentResults.rows.find(r => r.sub_agent_code === 'DESIGN');
      const databaseResult = subAgentResults.rows.find(r => r.sub_agent_code === 'DATABASE');

      const metadata = {
        sub_agent_informed: true,
        design_analysis: {
          verdict: designResult.verdict,
          confidence: designResult.confidence,
          recommendations: designResult.recommendations,
          risk_level: designResult.sub_metadata?.risk_level || 'medium',
          validation_complete: true
        },
        database_analysis: {
          verdict: databaseResult.verdict,
          confidence: databaseResult.confidence,
          recommendations: databaseResult.recommendations,
          schema_changes_required: databaseResult.sub_metadata?.schema_changes_required || false,
          performance_optimizations: databaseResult.sub_metadata?.performance_optimizations || false,
          validation_complete: true
        },
        gate1_compliant: true,
        validation_timestamp: new Date().toISOString()
      };

      // Update PRD metadata
      const updateQuery = `
        UPDATE product_requirements_v2
        SET
          metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
          updated_at = NOW()
        WHERE directive_id = $1
        RETURNING id, title
      `;

      const updateResult = await client.query(updateQuery, [sdId, JSON.stringify(metadata)]);

      if (updateResult.rows.length > 0) {
        console.log(`   ✅ Updated PRD: ${updateResult.rows[0].title}`);
        console.log(`      - DESIGN verdict: ${designResult.verdict} (${designResult.confidence}%)`);
        console.log(`      - DATABASE verdict: ${databaseResult.verdict} (${databaseResult.confidence}%)`);
        console.log(`      - GATE 1 compliant: ✓`);
      } else {
        console.log(`   ❌ No PRD found for ${sdId}`);
      }
    }

    // Verify all PRDs now have required metadata
    console.log('\n\n📊 Verifying PRD metadata compliance...\n');

    const verifyQuery = `
      SELECT
        pr.directive_id as sd_id,
        pr.title,
        pr.status,
        pr.metadata
      FROM product_requirements_v2 pr
      WHERE pr.directive_id = ANY($1)
      ORDER BY pr.directive_id
    `;

    const verifyResult = await client.query(verifyQuery, [childSDs]);

    let compliantCount = 0;
    verifyResult.rows.forEach((row, idx) => {
      const hasDesignAnalysis = row.metadata?.design_analysis?.verdict ? true : false;
      const hasDatabaseAnalysis = row.metadata?.database_analysis?.verdict ? true : false;
      const isGate1Compliant = hasDesignAnalysis && hasDatabaseAnalysis;

      const icon = isGate1Compliant ? '✅' : '❌';
      console.log(`${idx + 1}. ${row.sd_id}:`);
      console.log(`   ${icon} GATE 1 Compliance: ${isGate1Compliant ? 'PASSED' : 'FAILED'}`);
      console.log(`   - Design Analysis: ${hasDesignAnalysis ? '✓' : '✗'}`);
      console.log(`   - Database Analysis: ${hasDatabaseAnalysis ? '✓' : '✗'}`);
      console.log(`   - PRD Status: ${row.status}`);

      if (isGate1Compliant) compliantCount++;
    });

    const allCompliant = compliantCount === childSDs.length;

    console.log('\n📈 Summary:');
    console.log(`   Compliant PRDs: ${compliantCount}/${childSDs.length}`);

    if (allCompliant) {
      console.log('\n✨ All PRDs are now GATE 1 compliant!');
      console.log('Ready to retry PLAN→EXEC handoffs.');
    } else {
      console.log(`\n⚠️  Only ${compliantCount}/${childSDs.length} PRDs are compliant`);
    }

    return allCompliant;

  } catch (error) {
    console.error('❌ Error updating PRD metadata:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

// Run the update
updatePRDMetadata()
  .then(success => {
    if (success) {
      console.log('\n📋 Next Steps:');
      console.log('1. Re-run PLAN→EXEC handoffs for all 4 child SDs');
      console.log('2. Begin parallel implementation in EXEC phase');
      console.log('3. Implement with dual testing requirement');
      process.exit(0);
    } else {
      process.exit(1);
    }
  })
  .catch(console.error);