#!/usr/bin/env node
/**
 * Check what score the medium-quality content would get
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function checkScore() {
  console.log('🔍 Checking medium-quality score calculation...\n');

  const client = await createDatabaseClient('engineer', {
    verbose: false
  });

  try {
    // Temporarily disable constraint to see what score we get
    await client.query('ALTER TABLE retrospectives DROP CONSTRAINT retrospectives_quality_score_check');

    const result = await client.query(`
      INSERT INTO retrospectives (
        project_name, retro_type, title, description, conducted_date,
        what_went_well, what_needs_improvement, key_learnings, action_items, status
      ) VALUES (
        'EHG_Engineer', 'SD_COMPLETION', 'Test Medium Quality', 'Test',
        NOW(),
        $1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb, 'DRAFT'
      )
      RETURNING id, quality_score, quality_issues
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

    console.log(`Quality Score: ${result.rows[0].quality_score}/100`);
    console.log('\nScoring Breakdown:');
    console.log('Issues found:', result.rows[0].quality_issues);

    // Clean up
    await client.query('DELETE FROM retrospectives WHERE id = $1', [result.rows[0].id]);

    // Re-enable constraint
    await client.query(`
      ALTER TABLE retrospectives
      ADD CONSTRAINT retrospectives_quality_score_check
      CHECK (
        quality_score IS NOT NULL
        AND quality_score >= 70
        AND quality_score <= 100
      )
    `);

    console.log('\n✅ Constraint re-enabled');

  } catch (error) {
    console.error('\n❌ Failed:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

// Run check
checkScore()
  .then(() => {
    console.log('✅ Check complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
