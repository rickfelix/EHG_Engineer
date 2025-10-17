#!/usr/bin/env node
/**
 * Query SD-BOARD-VISUAL-BUILDER-001 details
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function querySD() {
  const client = await createDatabaseClient('engineer', { verbose: true });

  try {
    console.log('\n🎯 Querying SD-BOARD-VISUAL-BUILDER-001...\n');

    // Query SD metadata
    const sdResult = await client.query(`
      SELECT * FROM strategic_directives_v2
      WHERE sd_key = 'SD-BOARD-VISUAL-BUILDER-001'
      OR title LIKE '%Visual Workflow Orchestration%'
      OR title LIKE '%Board Visual Builder%'
      LIMIT 5;
    `);

    if (sdResult.rows.length === 0) {
      console.log('❌ SD not found in database. Searching by keyword...');

      const searchResult = await client.query(`
        SELECT sd_key, title, status, priority, current_phase, progress_percentage
        FROM strategic_directives_v2
        WHERE title ILIKE '%board%'
        OR title ILIKE '%workflow%'
        OR title ILIKE '%visual%'
        ORDER BY created_at DESC
        LIMIT 10;
      `);

      console.log(`\n📊 Found ${searchResult.rows.length} related SDs:`);
      searchResult.rows.forEach(sd => {
        console.log(`\n  ${sd.sd_key}`);
        console.log(`  Title: ${sd.title}`);
        console.log(`  Status: ${sd.status}`);
        console.log(`  Phase: ${sd.current_phase || 'N/A'}`);
        console.log(`  Priority: ${sd.priority}`);
        console.log(`  Progress: ${sd.progress_percentage || 0}%`);
      });

      return;
    }

    const sd = sdResult.rows[0];
    console.log('✅ SD Found!\n');
    console.log('═'.repeat(70));
    console.log(`SD Key: ${sd.sd_key}`);
    console.log(`Title: ${sd.title}`);
    console.log(`Status: ${sd.status}`);
    console.log(`Priority: ${sd.priority} (${getPriorityLabel(sd.priority)})`);
    console.log(`Current Phase: ${sd.current_phase || 'N/A'}`);
    console.log(`Progress: ${sd.progress_percentage || 0}%`);
    console.log(`Created: ${new Date(sd.created_at).toLocaleString()}`);
    console.log('═'.repeat(70));

    if (sd.objectives) {
      console.log(`\n📋 Objectives:\n${sd.objectives}`);
    }

    if (sd.description) {
      console.log(`\n📝 Description:\n${sd.description}`);
    }

    // Query linked PRD
    console.log('\n\n🔍 Checking for linked PRD...');
    const prdResult = await client.query(`
      SELECT * FROM product_requirements_v2
      WHERE sd_id = $1
      LIMIT 1;
    `, [sd.id]);

    if (prdResult.rows.length > 0) {
      const prd = prdResult.rows[0];
      console.log(`✅ PRD Found: ${prd.prd_key}`);
      console.log(`   Status: ${prd.status}`);
      console.log(`   Title: ${prd.title}`);
    } else {
      console.log('❌ No PRD linked yet');
    }

    // Query backlog items
    console.log('\n\n🔍 Checking for backlog linkages...');
    const backlogResult = await client.query(`
      SELECT * FROM sd_backlog_map
      WHERE sd_id = $1;
    `, [sd.id]);

    if (backlogResult.rows.length > 0) {
      console.log(`✅ Found ${backlogResult.rows.length} backlog item(s):`);
      backlogResult.rows.forEach((item, idx) => {
        console.log(`\n  ${idx + 1}. ${item.backlog_title}`);
        if (item.item_description) {
          console.log(`     Description: ${item.item_description.substring(0, 100)}...`);
        }
        console.log(`     Priority: ${item.priority || 'N/A'}`);
      });
    } else {
      console.log('❌ No backlog items linked');
    }

  } finally {
    await client.end();
  }
}

function getPriorityLabel(priority) {
  if (priority >= 90) return '🔴 CRITICAL';
  if (priority >= 70) return '🟠 HIGH';
  if (priority >= 50) return '🟡 MEDIUM';
  if (priority >= 30) return '🔵 LOW';
  return '⚪ MINIMAL';
}

querySD().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
