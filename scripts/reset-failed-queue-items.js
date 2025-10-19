#!/usr/bin/env node
/**
 * Reset failed queue items to queued status
 */

import { createDatabaseClient } from './lib/supabase-connection.js';
import dotenv from 'dotenv';

dotenv.config();

async function resetFailedItems() {
  console.log('🔄 Resetting failed queue items...\n');

  let client;

  try {
    client = await createDatabaseClient('ehg', {
      verify: true,
      verbose: false
    });

    const { rows: updated } = await client.query(`
      UPDATE avatar_generation_queue
      SET status = 'queued', error_message = NULL, processed_at = NULL
      WHERE status IN ('failed', 'processing')
      RETURNING id, agent_role, status
    `);

    if (updated.length === 0) {
      console.log('✅ No failed items to reset\n');
      return;
    }

    console.log(`✅ Reset ${updated.length} items:\n`);
    updated.forEach(item => {
      console.log(`   - ${item.agent_role}`);
    });
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

resetFailedItems().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
