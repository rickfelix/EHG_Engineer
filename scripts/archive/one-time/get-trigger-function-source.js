#!/usr/bin/env node

import { createDatabaseClient } from '../lib/supabase-connection.js';

async function getTriggerSource() {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    const result = await client.query(`
      SELECT prosrc, proname
      FROM pg_proc
      WHERE proname = 'enforce_handoff_system'
    `);

    if (result.rows.length === 0) {
      console.log('Trigger function "enforce_handoff_system" not found');
    } else {
      console.log('Trigger function source code:');
      console.log('==================================================');
      console.log(result.rows[0].prosrc);
      console.log('==================================================');
    }
  } finally {
    await client.end();
  }
}

getTriggerSource().catch(console.error);
