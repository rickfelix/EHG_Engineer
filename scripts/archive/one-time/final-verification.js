#!/usr/bin/env node
/**
 * Final verification that quality_score constraint is working correctly
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function finalVerification() {
  console.log('🎯 FINAL VERIFICATION: Quality Score Constraint\n');
  console.log('='.repeat(60));
  console.log('');

  const client = await createDatabaseClient('engineer', {
    verbose: false
  });

  let passedTests = 0;
  let totalTests = 0;

  try {
    // Test 1: High-quality content should get score >= 70
    console.log('Test 1: High-quality retrospective (should pass)');
    totalTests++;
    try {
      const result = await client.query(`
        INSERT INTO retrospectives (
          project_name, retro_type, title, description, conducted_date,
          what_went_well, what_needs_improvement, key_learnings, action_items, status
        ) VALUES (
          'EHG_Engineer', 'SD_COMPLETION', 'Test High Quality', 'Test',
          NOW(),
          $1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb, 'DRAFT'
        )
        RETURNING id, quality_score
      `, [
        JSON.stringify([
          'Successfully implemented feature A with 150 lines of code',
          'Reduced technical debt by refactoring 3 components',
          'Improved test coverage from 60% to 85% with 12 new E2E tests',
          'Enhanced performance with lazy loading of 5 heavy components',
          'Maintained backward compatibility while upgrading dependencies'
        ]),
        JSON.stringify([
          'Need to address 2 remaining edge cases in error handling',
          'Documentation could be more comprehensive for complex features',
          'Code review process took longer than expected'
        ]),
        JSON.stringify([
          'Early planning prevents scope creep and saves 20% development time',
          'Component composition patterns reduce code duplication by 40%',
          'Automated testing catches 90% of regressions before production',
          'Regular code reviews improve code quality and knowledge sharing',
          'Performance monitoring helps identify bottlenecks in real-time'
        ]),
        JSON.stringify([
          'Add comprehensive documentation for all new features',
          'Implement automated performance benchmarks in CI/CD pipeline',
          'Schedule weekly architecture review sessions'
        ])
      ]);

      const id = result.rows[0].id;
      const score = result.rows[0].quality_score;

      await client.query('DELETE FROM retrospectives WHERE id = $1', [id]);

      if (score >= 70) {
        console.log(`   ✅ PASSED: Quality score = ${score}/100 (meets threshold)\n`);
        passedTests++;
      } else {
        console.log(`   ❌ FAILED: Quality score = ${score}/100 (below threshold)\n`);
      }
    } catch (err) {
      console.log(`   ❌ FAILED: ${err.message}\n`);
    }

    // Test 2: Minimal content should get score < 70 and be rejected
    console.log('Test 2: Low-quality retrospective (should be rejected)');
    totalTests++;
    try {
      const result = await client.query(`
        INSERT INTO retrospectives (
          project_name, retro_type, title, description, conducted_date,
          what_went_well, what_needs_improvement, key_learnings, action_items, status
        ) VALUES (
          'EHG_Engineer', 'SD_COMPLETION', 'Test Low Quality', 'Test',
          NOW(),
          $1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb, 'DRAFT'
        )
        RETURNING id, quality_score
      `, [
        JSON.stringify(['SD completed']),
        JSON.stringify(['No issues']),
        JSON.stringify(['Everything went well']),
        JSON.stringify(['None'])
      ]);

      // If we get here, it was accepted (BAD)
      await client.query('DELETE FROM retrospectives WHERE id = $1', [result.rows[0].id]);
      console.log(`   ❌ FAILED: Low-quality content was accepted (score: ${result.rows[0].quality_score})\n`);
    } catch (err) {
      if (err.message.includes('retrospectives_quality_score_check')) {
        console.log('   ✅ PASSED: Low-quality content correctly rejected\n');
        passedTests++;
      } else {
        console.log(`   ❌ FAILED: Wrong error: ${err.message}\n`);
      }
    }

    // Test 3: Medium-quality content should get partial credit
    console.log('Test 3: Medium-quality retrospective (should pass with lower score)');
    totalTests++;
    try {
      const result = await client.query(`
        INSERT INTO retrospectives (
          project_name, retro_type, title, description, conducted_date,
          what_went_well, what_needs_improvement, key_learnings, action_items, status
        ) VALUES (
          'EHG_Engineer', 'SD_COMPLETION', 'Test Medium Quality', 'Test',
          NOW(),
          $1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb, 'DRAFT'
        )
        RETURNING id, quality_score
      `, [
        JSON.stringify([
          'Implemented the requested feature successfully with proper testing',
          'Fixed several bugs during the implementation process',
          'Collaborated well with team members on code reviews'
        ]),
        JSON.stringify([
          'Could improve testing coverage for edge cases'
        ]),
        JSON.stringify([
          'Breaking down tasks into smaller chunks makes development easier',
          'Regular communication with stakeholders prevents misunderstandings',
          'Code reviews catch issues before they reach production'
        ]),
        JSON.stringify([
          'Add more unit tests',
          'Document new features'
        ])
      ]);

      const id = result.rows[0].id;
      const score = result.rows[0].quality_score;

      await client.query('DELETE FROM retrospectives WHERE id = $1', [id]);

      if (score >= 70 && score < 90) {
        console.log(`   ✅ PASSED: Quality score = ${score}/100 (meets threshold with room for improvement)\n`);
        passedTests++;
      } else if (score >= 90) {
        console.log(`   ⚠️  MARGINAL: Quality score = ${score}/100 (higher than expected, but still valid)\n`);
        passedTests++;
      } else {
        console.log(`   ❌ FAILED: Quality score = ${score}/100 (below threshold)\n`);
      }
    } catch (err) {
      console.log(`   ❌ FAILED: ${err.message}\n`);
    }

    // Test 4: Verify constraint definition
    console.log('Test 4: Verify constraint definition');
    totalTests++;
    const constraintInfo = await client.query(`
      SELECT
        conname AS constraint_name,
        pg_get_constraintdef(oid) AS constraint_definition
      FROM pg_constraint
      WHERE conname = 'retrospectives_quality_score_check'
    `);

    if (constraintInfo.rows.length > 0 &&
        constraintInfo.rows[0].constraint_definition.includes('quality_score >= 70') &&
        constraintInfo.rows[0].constraint_definition.includes('quality_score <= 100')) {
      console.log('   ✅ PASSED: Constraint correctly defined\n');
      passedTests++;
    } else {
      console.log('   ❌ FAILED: Constraint not properly defined\n');
    }

    // Summary
    console.log('='.repeat(60));
    console.log(`\n📊 RESULTS: ${passedTests}/${totalTests} tests passed\n`);

    if (passedTests === totalTests) {
      console.log('✅ ALL TESTS PASSED - Quality score constraint is working correctly!\n');
      console.log('Summary:');
      console.log('  - High-quality retrospectives (score >= 70) are accepted');
      console.log('  - Low-quality retrospectives (score < 70) are rejected');
      console.log('  - Constraint enforces range: 70-100');
      console.log('  - Validation trigger calculates scores from content');
    } else {
      console.log(`❌ ${totalTests - passedTests} TEST(S) FAILED\n`);
    }

  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

// Run verification
finalVerification()
  .then(() => {
    console.log('✅ Verification complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
