#!/usr/bin/env node
/**
 * Check Avatar Generation Queue Status
 */

import { createDatabaseClient } from './lib/supabase-connection.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkQueueStatus() {
  console.log('📊 Avatar Generation Queue Status\n');

  let client;

  try {
    client = await createDatabaseClient('ehg', {
      verify: true,
      verbose: false
    });

    const { rows: queue } = await client.query(`
      SELECT
        aq.id,
        aq.agent_role,
        aq.status,
        aq.created_at,
        aq.processed_at,
        aq.error_message
      FROM avatar_generation_queue aq
      ORDER BY aq.created_at DESC
      LIMIT 20
    `);

    if (queue.length === 0) {
      console.log('✅ Queue is empty\n');
      return;
    }

    console.log(`Found ${queue.length} items in queue:\n`);

    const statusCounts = {};
    queue.forEach(item => {
      statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
      console.log(`${item.status === 'queued' ? '📋' : item.status === 'processing' ? '⏳' : item.status === 'completed' ? '✅' : '❌'} ${item.agent_role}`);
      console.log(`   Status: ${item.status}`);
      if (item.error_message) {
        console.log(`   Error: ${item.error_message.substring(0, 100)}`);
      }
      console.log('');
    });

    console.log('Summary by status:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
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

checkQueueStatus().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
