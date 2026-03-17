#!/usr/bin/env node
/**
 * Query high priority incomplete strategic directives
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function queryHighPrioritySDs() {
  let client;

  try {
    console.log('\n🔍 Querying high priority incomplete strategic directives...\n');

    // Connect to engineer database
    client = await createDatabaseClient('engineer', { verbose: true });

    // Query high priority incomplete SDs
    const query = `
      SELECT
        id,
        title,
        status,
        progress_percentage,
        priority,
        category,
        created_at
      FROM strategic_directives_v2
      WHERE priority = 'high'
        AND status != 'completed'
      ORDER BY created_at ASC;
    `;

    const result = await client.query(query);

    console.log(`\n📊 RESULTS: ${result.rows.length} high priority incomplete SDs found\n`);
    console.log('='.repeat(100));

    if (result.rows.length === 0) {
      console.log('\n✅ No high priority incomplete SDs found!\n');
      return;
    }

    // Group by status
    const byStatus = {};
    result.rows.forEach(row => {
      if (!byStatus[row.status]) {
        byStatus[row.status] = [];
      }
      byStatus[row.status].push(row);
    });

    // Display grouped results
    for (const [status, sds] of Object.entries(byStatus)) {
      console.log(`\n📌 STATUS: ${status.toUpperCase()} (${sds.length})`);
      console.log('-'.repeat(100));

      sds.forEach((sd, index) => {
        console.log(`\n${index + 1}. ${sd.id}`);
        console.log(`   Title: ${sd.title}`);
        console.log(`   Category: ${sd.category || 'N/A'}`);
        console.log(`   Progress: ${sd.progress_percentage || 0}%`);
        console.log(`   Created: ${new Date(sd.created_at).toISOString().split('T')[0]}`);
      });
    }

    console.log('\n' + '='.repeat(100));

    // Summary
    console.log('\n📋 SUMMARY BY STATUS:');
    for (const [status, sds] of Object.entries(byStatus)) {
      console.log(`   ${status}: ${sds.length}`);
    }
    console.log(`   TOTAL: ${result.rows.length}`);
    console.log('');

  } catch (error) {
    console.error('❌ Error querying database:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

// Run the query
queryHighPrioritySDs();
