#!/usr/bin/env node
/**
 * Test with realistic retrospective content
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function testRealistic() {
  console.log('🔍 Testing with realistic retrospective content...\n');

  const client = await createDatabaseClient('engineer', {
    verbose: false
  });

  try {
    console.log('Test: Inserting retrospective with quality content...');

    const whatWentWell = [
      'Successfully implemented comprehensive theme toggle system consolidation across 8 components',
      'Reduced code duplication by eliminating redundant localStorage access patterns in ThemeContext',
      'Improved TypeScript type safety with proper ThemeMode enum usage',
      'Enhanced testing coverage with 12 E2E tests passing consistently',
      'Maintained backward compatibility while refactoring theme persistence logic'
    ];

    const whatNeedsImprovement = [
      'Need to address 3 remaining Playwright test failures in auth flow',
      'Component state management could be optimized to reduce re-renders',
      'Documentation for theme context API needs to be expanded'
    ];

    const keyLearnings = [
      'Consolidating context providers early in development prevents technical debt accumulation',
      'Playwright MCP integration requires proper server state management between test runs',
      'Theme persistence should be handled centrally rather than scattered across components',
      'TypeScript enums provide better type safety than string literals for theme modes',
      'E2E tests should verify both light and dark mode rendering for all components'
    ];

    const actionItems = [
      'Fix remaining Playwright test failures in auth flow by implementing proper cleanup hooks',
      'Document ThemeContext API usage patterns in component development guide',
      'Add performance monitoring to track theme toggle re-render impact'
    ];

    try {
      const result = await client.query(`
        INSERT INTO retrospectives (
          project_name, retro_type, title, description,
          conducted_date, what_went_well, what_needs_improvement,
          key_learnings, action_items, status
        ) VALUES (
          'EHG_Engineer', 'SD_COMPLETION',
          'Theme Toggle Consolidation Retrospective',
          'Comprehensive retrospective on consolidating theme toggle system to eliminate duplication',
          NOW(), $1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb, 'DRAFT'
        )
        RETURNING id, sd_id, quality_score, quality_validated_at, quality_issues
      `, [
        JSON.stringify(whatWentWell),
        JSON.stringify(whatNeedsImprovement),
        JSON.stringify(keyLearnings),
        JSON.stringify(actionItems)
      ]);

      console.log('✅ INSERT SUCCEEDED!');
      console.log('\nResult:');
      console.log(`   ID: ${result.rows[0].id}`);
      console.log(`   SD_ID: ${result.rows[0].sd_id || 'NULL'}`);
      console.log(`   Quality Score: ${result.rows[0].quality_score}`);
      console.log(`   Validated At: ${result.rows[0].quality_validated_at}`);

      console.log('\nQuality Details:');
      console.log(`   Score: ${result.rows[0].quality_score}/100`);
      if (result.rows[0].quality_issues && result.rows[0].quality_issues.length > 0) {
        console.log('   Issues:');
        result.rows[0].quality_issues.forEach(issue => {
          console.log(`     - ${issue.field}: ${issue.issue}`);
        });
      } else {
        console.log('   No issues - excellent quality!');
      }

      // Clean up
      await client.query('DELETE FROM retrospectives WHERE id = $1', [result.rows[0].id]);
      console.log('\n✅ Test data cleaned up');

    } catch (err) {
      console.log(`❌ INSERT FAILED: ${err.message}`);
      console.log(`   Detail: ${err.detail || 'N/A'}`);
      console.log(`   Hint: ${err.hint || 'N/A'}`);
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

// Run test
testRealistic()
  .then(() => {
    console.log('\n✅ Test complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
