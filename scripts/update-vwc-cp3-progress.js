#!/usr/bin/env node

import { createDatabaseClient } from '../lib/supabase-connection.js';
import dotenv from 'dotenv';

dotenv.config();

async function updateProgress() {
  let client;
  try {
    client = await createDatabaseClient('engineer', { verify: true });

    const { rows } = await client.query(
      `UPDATE strategic_directives_v2
       SET progress_percentage = 75, updated_at = NOW()
       WHERE id = $1
       RETURNING id, progress_percentage`,
      ['SD-VWC-INTUITIVE-FLOW-001']
    );

    console.log(`✅ SD Progress updated: ${rows[0].progress_percentage}% (Checkpoint 3 complete)`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    if (client) await client.end();
  }
}

updateProgress().catch(console.error);
