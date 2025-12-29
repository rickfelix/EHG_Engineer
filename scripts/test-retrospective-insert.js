#!/usr/bin/env node

/**
 * Test script to verify retrospective insert with JSONB fields
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function testInsert() {
  console.log('\n🧪 TESTING RETROSPECTIVE INSERT\n');
  console.log('═'.repeat(60));

  const client = await createDatabaseClient('engineer', { verbose: true });

  try {
    // Test with JSONB format using DRAFT status (correct)
    console.log('\n1️⃣ Testing INSERT with JSONB format (DRAFT status):\n');

    const testInsert = `
      INSERT INTO retrospectives (
        sd_id,
        target_application,
        project_name,
        retro_type,
        title,
        description,
        conducted_date,
        what_went_well,
        key_learnings,
        action_items,
        what_needs_improvement,
        learning_category,
        affected_components,
        quality_score,
        status
      ) VALUES (
        'TEST-JSONB-001',
        'EHG_engineer',
        'Test Project',
        'TEST',
        'Diagnostic Test Retrospective',
        'Testing quality_score constraint with JSONB',
        NOW(),
        '["Item 1", "Item 2", "Item 3", "Item 4", "Item 5", "Item 6"]'::jsonb,
        '["Learning 1 with sufficient detail to pass validation", "Learning 2 with sufficient detail to pass validation", "Learning 3 with sufficient detail to pass validation", "Learning 4 with sufficient detail to pass validation", "Learning 5 with sufficient detail to pass validation"]'::jsonb,
        '["Action 1", "Action 2", "Action 3", "Action 4"]'::jsonb,
        '["Improvement 1", "Improvement 2", "Improvement 3"]'::jsonb,
        'APPLICATION_ISSUE',
        ARRAY['Test Component'],
        NULL,  -- Let trigger calculate
        'DRAFT'  -- Use DRAFT to avoid PUBLISHED validation
      )
      RETURNING id, quality_score, quality_issues, quality_validated_by;
    `;

    const testResult = await client.query(testInsert);
    console.log('✅ INSERT SUCCEEDED');
    console.log('\nReturned values:');
    console.log('   ID:', testResult.rows[0].id);
    console.log('   Quality Score:', testResult.rows[0].quality_score);
    console.log('   Quality Validated By:', testResult.rows[0].quality_validated_by);
    console.log('   Quality Issues:');
    console.log(JSON.stringify(testResult.rows[0].quality_issues, null, 2));

    if (testResult.rows[0].quality_score >= 70) {
      console.log('\n✅ Quality score meets threshold (≥70)');
      console.log('   The constraint would allow this insert');
    } else {
      console.log('\n⚠️  Quality score below threshold (<70)');
      console.log('   This indicates the trigger calculated a low score based on content');
      console.log('   The constraint would BLOCK this insert if status were PUBLISHED');
    }

    // Clean up test record
    await client.query('DELETE FROM retrospectives WHERE sd_id = \'TEST-JSONB-001\'');
    console.log('\n✅ Test record cleaned up');

  } catch (_error) {
    console.log('❌ TEST FAILED');
    console.log('   Error:', error.message);
    console.log('\n   Full error:');
    console.log('   ─'.repeat(60));
    console.log(error);
  } finally {
    await client.end();
    console.log('\n' + '═'.repeat(60));
    console.log('✅ Test complete\n');
  }
}

testInsert().catch(err => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
