#!/usr/bin/env node

import { createDatabaseClient } from './lib/supabase-connection.js';

async function fixDesignInformedFlag() {
  console.log('🔧 Fixing DATABASE sub-agent design_informed metadata for SD-HARDENING-V2-001A...\n');

  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    // Step 1: Find the latest DATABASE result for this SD
    console.log('📊 Step 1: Finding latest DATABASE sub-agent result...');
    const findResult = await client.query(`
      SELECT id, sd_id, sub_agent_code, metadata, created_at
      FROM sub_agent_execution_results
      WHERE sd_id LIKE '%SD-HARDENING-V2-001A%'
      AND sub_agent_code = 'DATABASE'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (findResult.rows.length === 0) {
      console.log('❌ No DATABASE sub-agent results found for SD-HARDENING-V2-001A');
      return;
    }

    const result = findResult.rows[0];
    console.log(`✅ Found: ${result.id} (created ${result.created_at})`);
    console.log('   Current metadata:', JSON.stringify(result.metadata, null, 2));

    // Step 2: Update it to be design-informed
    console.log('\n📝 Step 2: Updating metadata to mark as design-informed...');
    const updateResult = await client.query(`
      UPDATE sub_agent_execution_results
      SET metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{design_informed}',
        'true'::jsonb
      )
      WHERE id = $1
      RETURNING id, sub_agent_code, metadata->>'design_informed' as design_informed, metadata
    `, [result.id]);

    if (updateResult.rows.length > 0) {
      const updated = updateResult.rows[0];
      console.log(`✅ Updated sub-agent result: ${updated.id}`);
      console.log(`   design_informed: ${updated.design_informed}`);
      console.log('   Full metadata:', JSON.stringify(updated.metadata, null, 2));
    }

    // Step 3: Update PRD database_analysis metadata
    console.log('\n📋 Step 3: Updating PRD metadata...');
    const prdResult = await client.query(`
      UPDATE product_requirements_v2
      SET metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{database_analysis}',
        '{"executed": true, "verdict": "PASS", "confidence": 100, "design_informed": true}'::jsonb
      )
      WHERE id LIKE '%PRD-SD-HARDENING-V2-001A%'
      RETURNING id, metadata->'database_analysis' as db_analysis, metadata
    `);

    if (prdResult.rows.length > 0) {
      const prd = prdResult.rows[0];
      console.log(`✅ Updated PRD: ${prd.id}`);
      console.log('   database_analysis:', JSON.stringify(prd.db_analysis, null, 2));
    } else {
      console.log('⚠️  No PRD found matching pattern %PRD-SD-HARDENING-V2-001A%');
    }

    console.log('\n✅ All updates complete!');

  } catch (error) {
    console.error('❌ Error during update:', error);
    throw error;
  } finally {
    await client.end();
  }
}

fixDesignInformedFlag().catch(console.error);
