#!/usr/bin/env node

import { createDatabaseClient } from '../lib/supabase-connection.js';

async function checkTemplates() {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    const result = await client.query(`
      SELECT id, from_agent, to_agent, handoff_type, name
      FROM leo_handoff_templates
      ORDER BY id
    `);

    console.log('leo_handoff_templates table:');
    if (result.rows.length === 0) {
      console.log('  (empty - no templates found)');
    } else {
      result.rows.forEach(r => {
        console.log(`  ID ${r.id}: ${r.from_agent} → ${r.to_agent} (${r.handoff_type}) - ${r.name}`);
      });
    }
  } finally {
    await client.end();
  }
}

checkTemplates().catch(console.error);
