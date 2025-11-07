#!/usr/bin/env node
/**
 * PRD Metadata Diagnosis for SD-CREWAI-ARCHITECTURE-001
 *
 * Purpose: Investigate Gate 1 validation failure
 * - Query PRD existence and metadata structure
 * - Check for missing design_analysis and database_analysis fields
 * - Verify sub-agent execution results
 * - Provide exact fix recommendations
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';

const SD_ID = 'SD-CREWAI-ARCHITECTURE-001';

async function diagnosePRDMetadata() {
  console.log('=== PRD Metadata Diagnosis for Gate 1 Failure ===\n');
  console.log(`SD ID: ${SD_ID}`);
  console.log(`Database: EHG_Engineer (dedlbzhpgkmetvhbkyzq)\n`);

  const client = await createSupabaseServiceClient('engineer', { verbose: true });

  try {
    // TASK 1: Query PRD State
    console.log('\n--- TASK 1: Query PRD State ---');
    const { data: prdData, error: prdError } = await client
      .from('product_requirements_v2')
      .select('id, title, metadata, created_at')
      .eq('sd_id', SD_ID);

    if (prdError) {
      console.error('❌ Error querying PRD:', prdError.message);
      console.error('   Code:', prdError.code);
      console.error('   Details:', prdError.details);

      // Check if this is the "Cannot coerce to single JSON object" error
      if (prdError.message.includes('coerce') || prdError.message.includes('single')) {
        console.log('\n🔍 ROOT CAUSE: Query returned multiple rows or unexpected format');
        console.log('   Expected: Single PRD row');
        console.log('   Actual: Multiple rows or array result');

        // Try counting rows
        const { data: countData, error: countError } = await client
          .from('product_requirements_v2')
          .select('id', { count: 'exact', head: false })
          .eq('sd_id', SD_ID);

        if (!countError && countData) {
          console.log(`   Found ${countData.length} PRD(s) for ${SD_ID}`);
          if (countData.length > 1) {
            console.log('   ⚠️ ISSUE: Multiple PRDs exist for same SD_ID (data integrity violation)');
          }
        }
      }
    } else {
      console.log('✅ PRD Query Successful');
      console.log(`   Found: ${prdData?.length || 0} PRD(s)`);

      if (prdData && prdData.length > 0) {
        const prd = prdData[0];
        console.log('\n📄 PRD Details:');
        console.log(`   ID: ${prd.id}`);
        console.log(`   Title: ${prd.title}`);
        console.log(`   Created: ${prd.created_at}`);

        console.log('\n📊 Metadata Structure:');
        if (!prd.metadata) {
          console.log('   ❌ metadata is NULL');
        } else if (typeof prd.metadata !== 'object') {
          console.log(`   ❌ metadata is not an object (type: ${typeof prd.metadata})`);
        } else {
          const metadataKeys = Object.keys(prd.metadata);
          console.log(`   Keys present (${metadataKeys.length}):`, metadataKeys);

          // Check for required fields
          const requiredFields = ['design_analysis', 'database_analysis'];
          console.log('\n🔍 Required Fields Check:');
          requiredFields.forEach(field => {
            const exists = field in prd.metadata;
            const hasValue = exists && prd.metadata[field] !== null && prd.metadata[field] !== undefined;
            console.log(`   ${hasValue ? '✅' : '❌'} ${field}: ${exists ? (hasValue ? 'EXISTS with value' : 'EXISTS but null/undefined') : 'MISSING'}`);

            if (hasValue && typeof prd.metadata[field] === 'object') {
              const subKeys = Object.keys(prd.metadata[field]);
              console.log(`      Structure: ${JSON.stringify(prd.metadata[field], null, 2).substring(0, 200)}...`);
            }
          });

          // Show full metadata structure (truncated)
          console.log('\n📋 Full Metadata (truncated):');
          console.log(JSON.stringify(prd.metadata, null, 2).substring(0, 500) + '...');
        }
      } else {
        console.log('   ❌ No PRD found for SD_ID');
      }
    }

    // TASK 2: Check Sub-Agent Execution Results
    console.log('\n\n--- TASK 2: Check Sub-Agent Execution Results ---');
    const { data: execData, error: execError } = await client
      .from('sub_agent_execution_results')
      .select('agent_name, status, output, created_at')
      .eq('sd_id', SD_ID)
      .in('agent_name', ['DESIGN', 'DATABASE'])
      .order('created_at', { ascending: false });

    if (execError) {
      console.error('❌ Error querying sub-agent results:', execError.message);
    } else {
      console.log(`✅ Found ${execData?.length || 0} sub-agent execution(s)`);

      if (execData && execData.length > 0) {
        execData.forEach((exec, idx) => {
          console.log(`\n[${idx + 1}] ${exec.agent_name} Sub-Agent:`);
          console.log(`    Status: ${exec.status}`);
          console.log(`    Created: ${exec.created_at}`);
          console.log(`    Output Preview: ${JSON.stringify(exec.output, null, 2).substring(0, 200)}...`);

          // Check if output contains analysis that should be in PRD metadata
          if (exec.output) {
            const hasAnalysis = typeof exec.output === 'object' && (
              exec.output.analysis ||
              exec.output.schema_design ||
              exec.output.database_changes
            );
            console.log(`    Contains Analysis: ${hasAnalysis ? 'YES ✅' : 'NO ❌'}`);
          }
        });
      } else {
        console.log('   ⚠️ No DESIGN or DATABASE sub-agent executions found');
        console.log('   This may indicate sub-agents were not run during PLAN phase');
      }
    }

    // TASK 3: Root Cause Analysis
    console.log('\n\n--- TASK 3: Root Cause Analysis ---');

    if (prdError && prdError.message.includes('coerce')) {
      console.log('🎯 PRIMARY CAUSE: Query format mismatch');
      console.log('   - Handoff script expected single JSON object');
      console.log('   - Query returned array or multiple rows');
      console.log('   - Solution: Fix query to use .single() or handle array');
    } else if (prdData && prdData.length > 0) {
      const prd = prdData[0];
      const missingFields = [];

      if (!prd.metadata) {
        missingFields.push('metadata is NULL');
      } else {
        if (!prd.metadata.design_analysis) missingFields.push('design_analysis');
        if (!prd.metadata.database_analysis) missingFields.push('database_analysis');
      }

      if (missingFields.length > 0) {
        console.log('🎯 PRIMARY CAUSE: Incomplete PRD metadata');
        console.log(`   Missing fields: ${missingFields.join(', ')}`);
        console.log('   - PRD was created without sub-agent analysis');
        console.log('   - Or sub-agent results were not merged into metadata');
      } else {
        console.log('🎯 PRIMARY CAUSE: Unknown (metadata appears complete)');
        console.log('   - PRD has required fields');
        console.log('   - Issue may be in validation logic or query format');
      }
    } else {
      console.log('🎯 PRIMARY CAUSE: PRD does not exist');
      console.log('   - No PRD record found for SD_ID');
      console.log('   - PLAN phase may not have completed');
    }

    // TASK 4: Solution Recommendation
    console.log('\n\n--- TASK 4: Solution Recommendation ---');

    if (!prdData || prdData.length === 0) {
      console.log('📌 RECOMMENDATION: Create PRD using process script');
      console.log('\n   Command:');
      console.log(`   node scripts/add-prd-to-database.js ${SD_ID}`);
      console.log('\n   This will:');
      console.log('   1. Run DESIGN and DATABASE sub-agents');
      console.log('   2. Collect their analysis outputs');
      console.log('   3. Create PRD with complete metadata');
      console.log('   4. Validate metadata structure');
    } else if (prdData[0].metadata && (!prdData[0].metadata.design_analysis || !prdData[0].metadata.database_analysis)) {
      console.log('📌 RECOMMENDATION: Update existing PRD metadata');
      console.log('\n   Option A: Re-run sub-agents and merge results');
      console.log(`   node scripts/update-prd-metadata.js ${SD_ID} --run-subagents`);
      console.log('\n   Option B: Manual SQL update (if sub-agent results exist in DB)');
      console.log(`   UPDATE product_requirements_v2`);
      console.log(`   SET metadata = metadata || '{"design_analysis": {...}, "database_analysis": {...}}'::jsonb`);
      console.log(`   WHERE sd_id = '${SD_ID}';`);
      console.log('\n   Option C: Re-create PRD (safest)');
      console.log(`   DELETE FROM product_requirements_v2 WHERE sd_id = '${SD_ID}';`);
      console.log(`   node scripts/add-prd-to-database.js ${SD_ID}`);
    } else {
      console.log('📌 RECOMMENDATION: Fix query logic in handoff script');
      console.log('\n   Issue: PRD metadata appears complete, but query format mismatch');
      console.log('   Fix: Update handoff creation script to use:');
      console.log('     .select("*").eq("sd_id", SD_ID).single()');
      console.log('   Instead of:');
      console.log('     .select("*").eq("sd_id", SD_ID) // Returns array');
    }

    // TASK 5: Prevention
    console.log('\n\n--- TASK 5: Prevention Recommendations ---');
    console.log('🛡️ Add to LEO Protocol validation:');
    console.log('   1. PRD metadata schema validation before handoff creation');
    console.log('   2. Require design_analysis and database_analysis fields');
    console.log('   3. Add .single() to PRD queries expecting one result');
    console.log('   4. Create issue_pattern for "Missing PRD metadata" (PAT-XXX)');
    console.log('\n🛡️ Add to add-prd-to-database.js:');
    console.log('   1. Validate sub-agent results before merging');
    console.log('   2. Fail-fast if DESIGN or DATABASE sub-agents return empty');
    console.log('   3. Log metadata structure before insertion');
    console.log('\n🛡️ Add to unified-handoff-system.js:');
    console.log('   1. Pre-flight PRD metadata check before Gate 1');
    console.log('   2. Clear error message if metadata incomplete');
    console.log('   3. Suggest exact fix command (not generic "re-create PRD")');

    console.log('\n\n=== Diagnosis Complete ===');
    console.log('📊 Summary:');
    console.log(`   PRD Exists: ${prdData && prdData.length > 0 ? 'YES' : 'NO'}`);
    console.log(`   Metadata Complete: ${prdData?.[0]?.metadata?.design_analysis && prdData?.[0]?.metadata?.database_analysis ? 'YES' : 'NO'}`);
    console.log(`   Sub-Agents Executed: ${execData && execData.length > 0 ? 'YES' : 'NO'}`);

  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
    console.error('   Stack:', error.stack);
  }
}

// Run diagnosis
diagnosePRDMetadata()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
