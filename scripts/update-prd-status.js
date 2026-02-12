import dotenv from 'dotenv';
import _path from 'path';
import { createDatabaseClient } from '../lib/supabase-connection.js';

// Load environment variables
dotenv.config();

(async () => {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    // First, fetch the current PRD to check its state
    const prdResult = await client.query(`
      SELECT
        id,
        prd_id,
        title,
        status,
        metadata
      FROM prd
      WHERE prd_id = 'PRD-SD-LEO-INFRA-REFACTOR-LARGE-LEO-001'
      LIMIT 1
    `);

    if (prdResult.rowCount === 0) {
      console.log('❌ PRD not found with ID: PRD-SD-LEO-INFRA-REFACTOR-LARGE-LEO-001');
      await client.end();
      process.exit(1);
    }

    const prd = prdResult.rows[0];
    console.log('📋 Current PRD Status:');
    console.log('   ID:', prd.prd_id);
    console.log('   Title:', prd.title);
    console.log('   Status:', prd.status);
    console.log('   Metadata keys:', Object.keys(prd.metadata || {}));

    // Update the PRD: set status to 'approved'
    const newMetadata = prd.metadata || {};

    // If exploration_summary doesn't exist, we need to add it
    if (!newMetadata.exploration_summary) {
      console.log('\n📝 exploration_summary not found in metadata. Need to set it.');
    } else {
      console.log('\n✅ exploration_summary already exists:', JSON.stringify(newMetadata.exploration_summary).substring(0, 100) + '...');
    }

    const updateResult = await client.query(`
      UPDATE prd
      SET
        status = 'approved',
        updated_at = NOW()
      WHERE prd_id = 'PRD-SD-LEO-INFRA-REFACTOR-LARGE-LEO-001'
      RETURNING id, prd_id, status, updated_at
    `);

    if (updateResult.rowCount > 0) {
      console.log('\n✅ PRD status updated to "approved"');
      console.log('   Updated PRD:', updateResult.rows[0]);
    } else {
      console.log('\n❌ Failed to update PRD');
    }

    await client.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    await client.end();
    process.exit(1);
  }
})();
