#!/usr/bin/env node

import { createDatabaseClient } from '../lib/supabase-connection.js';

const client = await createDatabaseClient('engineer', { verify: true });
try {
  const result = await client.query(`
    SELECT id, section_type, title, context_tier, target_file,
           LENGTH(content) as content_length,
           metadata
    FROM leo_protocol_sections
    WHERE section_type LIKE 'vision_v2_%'
    ORDER BY id
  `);

  console.log('Inserted Vision V2 Protocol Sections:\n');
  result.rows.forEach(row => {
    console.log(`ID ${row.id}: ${row.section_type}`);
    console.log(`  Title: ${row.title}`);
    console.log(`  Context Tier: ${row.context_tier}`);
    console.log(`  Target File: ${row.target_file}`);
    console.log(`  Content Length: ${row.content_length} chars`);
    console.log(`  Metadata: ${JSON.stringify(row.metadata)}`);
    console.log('');
  });

  console.log(`Total: ${result.rows.length} Vision V2 sections`);
} finally {
  await client.end();
}
