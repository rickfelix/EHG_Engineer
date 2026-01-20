#!/usr/bin/env node
/**
 * Query LEO Protocol Section
 * Usage: node scripts/query-leo-section.js <section-id>
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function main() {
  const sectionId = process.argv[2] || '390';
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    const result = await client.query(
      'SELECT id, title, content, target_file FROM leo_protocol_sections WHERE id = $1;',
      [sectionId]
    );

    if (result.rows.length === 0) {
      console.log(`\n❌ No section found with ID: ${sectionId}\n`);
      return;
    }

    const section = result.rows[0];
    console.log(`\n📄 LEO Protocol Section ${section.id}`);
    console.log(`Title: ${section.title}`);
    console.log(`Target File: ${section.target_file || 'N/A'}`);
    console.log(`Content Length: ${section.content ? section.content.length : 0} chars`);
    console.log('\n--- Content Preview (first 1000 chars) ---');
    console.log(section.content ? section.content.substring(0, 1000) : 'No content');
    console.log('\n--- End Preview ---\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
