#!/usr/bin/env node

/**
 * Update PRD Status to Approved for Stage 4 Child SDs
 * Enables PLAN→EXEC handoff creation
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

async function updatePRDStatus() {
  let client;

  try {
    console.log('📝 Updating PRD status to approved for Stage 4 child SDs...\n');

    // Connect to database
    client = await createDatabaseClient('engineer', { verify: false });

    for (const sdId of childSDs) {
      console.log(`\n🔄 Updating PRD status for ${sdId}...`);

      // Update PRD status to approved
      const updateQuery = `
        UPDATE product_requirements_v2
        SET
          status = 'approved',
          updated_at = NOW()
        WHERE directive_id = $1
        RETURNING id, title, status
      `;

      const result = await client.query(updateQuery, [sdId]);

      if (result.rows.length > 0) {
        console.log(`   ✅ Updated PRD: ${result.rows[0].title}`);
        console.log(`   Status: ${result.rows[0].status}`);
      } else {
        console.log(`   ⚠️  No PRD found for ${sdId}`);
      }
    }

    // Verify all PRDs are now approved
    console.log('\n\n📊 Verifying PRD status updates...');

    const verifyQuery = `
      SELECT
        pr.directive_id as sd_id,
        pr.title,
        pr.status,
        sd.current_phase
      FROM product_requirements_v2 pr
      JOIN strategic_directives_v2 sd ON sd.id = pr.directive_id
      WHERE pr.directive_id = ANY($1)
      ORDER BY pr.directive_id
    `;

    const verifyResult = await client.query(verifyQuery, [childSDs]);

    console.log('\nPRD Status Summary:');
    console.log('==================');

    let approvedCount = 0;
    verifyResult.rows.forEach((row, idx) => {
      const icon = row.status === 'approved' ? '✅' : '❌';
      console.log(`${idx + 1}. ${row.sd_id}: ${icon} ${row.status}`);
      if (row.status === 'approved') approvedCount++;
    });

    const allApproved = approvedCount === childSDs.length;

    if (allApproved) {
      console.log('\n✨ All PRDs are now approved!');
      console.log('Ready to create PLAN→EXEC handoffs.');
    } else {
      console.log(`\n⚠️  Only ${approvedCount}/${childSDs.length} PRDs are approved`);
    }

    return allApproved;

  } catch (error) {
    console.error('❌ Error updating PRD status:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

// Run the update
updatePRDStatus()
  .then(success => {
    if (success) {
      console.log('\n📋 Next Steps:');
      console.log('1. Run PLAN→EXEC handoffs for all child SDs');
      console.log('2. Begin parallel implementation in EXEC phase');
      console.log('3. Execute sub-agent validation and testing');
      process.exit(0);
    } else {
      process.exit(1);
    }
  })
  .catch(console.error);